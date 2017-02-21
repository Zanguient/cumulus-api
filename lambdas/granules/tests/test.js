'use strict';
import assert from 'assert';
import record from 'cumulus-common/tests/data/granule.json';
import { Search } from 'cumulus-common/es/search';
import { list } from '../index';

describe('Granules endpoint', () => {
  before(async () => {
    // set the env variables
    process.env.MODE = 'local';
    process.env.StackName = 'cumulus-api-test-es';
    process.env.GranulesTable = 'es-test-graneules-table';

    // get ES client
    const client = Search.es();

    // add index
    await client.indices.create({ index: process.env.StackName });

    // add record
    try {
      await client.index({
        index: process.env.StackName,
        type: process.env.GranulesTable,
        id: record.granuleId,
        body: record,
        refresh: true,
        //consistency: 'all'
      });
    }
    catch (e) {
      console.error(e);
    }
  });

  it('lists', (done) => {
    list({}, null, (error, res) => {
      assert.equal(res.meta.count, 1);
      done();
    });
  });

  after(async () => {
    // get ES client
    const client = Search.es();

    // delete index
    await client.indices.delete({ index: process.env.StackName });
  });
});