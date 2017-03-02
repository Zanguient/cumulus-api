'use strict';
import queue from 'queue-async';
import { localRun } from 'cumulus-common/local';
import { Search } from 'cumulus-common/es/search';
import { AttributeValue } from 'dynamodb-data-types';
import { get } from 'lodash';
const unwrap = AttributeValue.unwrap;

const index = process.env.StackName || 'cumulus-local-test';
const granuleRelationTypes = [
  [`${process.env.CollectionsTable}Granules`, 'collectionName'],
  [`${process.env.PDRsTable}Granules`, 'pdrName']
];


async function deleteRecord(params) {
  const esClient = Search.es();
  let types = [params.type];

  // we have to delete granule records from granule table
  // and its related parent/child granule tables
  if (params.type === process.env.GranulesTable) {
    types = types.concat(granuleRelationTypes);
  }

  for (const t of types) {
    try {
      params.type = t[0];
      await esClient.delete(params);
    }
    catch (e) {
      if (e.status === 404 && e.message === 'Not Found') {
        console.log('Nothing to delete');
      }
      throw e;
    }
  }
}

function saveRecord(data, params, callback) {
  const esClient = Search.es();
  esClient.get(params, (error, response, status) => {
    if (status !== 200 && status !== 404) {
      callback(error);
    }

    const writes = [];

    // handle Granule parent/child relationships
    // this is needed to simplify running aggregations on granules
    // from Collections and PDRs tables
    if (params.type === process.env.GranulesTable) {
      // write granule summer to children types


      // we only record the fields we need for aggregations
      const dataSummary = {
        granuleId: data.granuleId,
        granuleStatus: data.status,
        granuleDuration: data.duration
      };

      granuleRelationTypes.forEach(t => {
        // make sure granule record has the parnet id
        if (data.hasOwnProperty(t[1])) {
          const input = Object.assign({}, params, {
            body: dataSummary
          });

          input.type = t[0];
          input.parent = data[t[1]];

          writes.push(esClient.index(input));
        }
      });
    }

    params.refresh = true;

    const input = Object.assign({}, params, {
      body: data
    });

    writes.push(esClient.index(input));

    Promise.all(writes)
      .then((results) => callback(null, results))
      .catch(e => callback(e));
  });
}

function processRecords(event, done) {
  const q = queue();
  const records = get(event, 'Records');
  console.log('Processing records');
  if (!records) {
    return done(null, 'No records found in event');
  }
  records.forEach((record) => {
    // get table name from the record information
    // we use table name as the type in ES
    const tableArn = record.eventSourceARN.match(/table\/(.*)\/stream/);
    const type = tableArn[1];

    // now get the hash and range (if any) and use them as id key for ES
    const keys = unwrap(get(record, 'dynamodb.Keys'));
    const ids = Object.keys(keys).map(k => keys[k]);
    const id = ids.join('_');

    console.log(`Received ${id} from the stream`);

    if (id) {
      const params = { index, type, id };
      if (record.eventName === 'REMOVE') {
        console.log(`Deleting ${id} from ${type}`);
        q.defer((callback) => {
          deleteRecord(params)
            .then(r => callback(null, r))
            .catch(e => callback(e));
        });
      }
      else {
        const data = unwrap(record.dynamodb.NewImage);
        console.log(`Adding/Updating ${id} to ${type}`);
        q.defer((callback) => saveRecord(data, params, callback));
      }
    }
    else {
      // defer an error'd callback so we can handle it in awaitAll.
      q.defer((callback) =>
        callback(new Error(`Could not construct a valid id from ${keys}`))
      );
    }
  });

  q.awaitAll((error, result) => {
    if (error) {
      done(null, error.message);
    }
    else {
      done(null, `Records altered: ${result.filter(Boolean).length}`);
    }
  });
}

/**
 * Sync changes to dynamodb to an elasticsearch instance.
 * Sending updates to this lambda is handled by automatically AWS.
 * @param {array} Records list of records with an eventName property signifying REMOVE or INSERT.
 * @return {string} response text indicating the number of records altered in elasticsearch.
 */
export function handler(event, context, done) {
  const esClient = Search.es();
  esClient.indices.exists({ index }, (error, response, status) => {
    if (status === 404) {
      console.log(`${index} doesn't exist. Creating it`);
      esClient.indices.create({ index }, (e) => {
        if (e) {
          done(null, e.message);
        }
        else {
          console.log(`Index ${index} created on ES`);
          processRecords(event, done);
        }
      });
    }
    else if (status === 200) {
      processRecords(event, done);
    }
    else {
      done(null, error.message);
    }
  });
}

localRun(() => {
});
