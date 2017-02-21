#! /usr/bin/env node
'use strict';

const AWS = require('aws-sdk');
const parseConfig = require('../src/common').parseConfig;

module.exports = function() {

  // use dummy access info
  AWS.config.update({
    accessKeyId: 'myKeyId',
    secretAccessKey: 'secretKey',
    region: 'us-east-1'
  });

  const dynamodb = new AWS.DynamoDB({
    endpoint: new AWS.Endpoint('http://localhost:8000')
  });


  const config = parseConfig();

  // create DynamoDB Table
  config.dynamos.forEach((table) => {
    const params = {
      AttributeDefinitions: [],
      KeySchema: [],
      ProvisionedThroughput: {
        ReadCapacityUnits: 5,
        WriteCapacityUnits: 5
      },
      TableName: `${config.stackName}-${config.stage}-${table.name}`
    };

    table.attributes.forEach((attribute) => {
      params.AttributeDefinitions.push({
        AttributeName: attribute.name,
        AttributeType: attribute.type
      });
    });

    table.schema.forEach((schem) => {
      params.KeySchema.push({
        AttributeName: schem.name,
        KeyType: schem.type
      });
    });

    dynamodb.createTable(params, (err) => {
      if (err && err.stack.match(/(Cannot create preexisting table)/)) {
        console.log(`${params.TableName} is already created`);
      }
    });
  });

  // create SQS queues
  console.log('Creating SQS queues');
  const sqs = new AWS.SQS({
    endpoint: new AWS.Endpoint('http://localhost:9324')
  });

  config.sqs.forEach((queue) => {
    const queueName = `${config.stackName}-${config.stage}-${queue.name}`;

    const createQueue = () => sqs.createQueue({ QueueName: queueName }).promise();

    // get queue url (if any)
    sqs.getQueueUrl({ QueueName: queueName }).promise()
      .then(data => {
        if (data.QueueUrl) {
          // delete the queue
          return sqs.deleteQueue({ QueueUrl: data.QueueUrl }).promise();
        }
        return;
      })
      .then((deleted) => {
        if (deleted) console.log(`${queueName} deleted`);
        return createQueue();
      })
      .then(data => console.log(data))
      .catch(e => {
        if (e.code === 'AWS.SimpleQueueService.NonExistentQueue') {
          return createQueue().then(data => console.log(data)).catch(err => console.log(err));
        }
        console.log(e);
      });
  });
};