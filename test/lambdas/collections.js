'use strict';
import assert from 'assert';
import sinon from 'sinon';
import { list, get, post, put } from '../../lambdas/collections';
import record from '../data/collection.json';
import * as db from  '../../lib/db';
import * as es from '../../lib/es';

describe('Collections endpoint', () => {
  it('lists', (done) => {
    const mock = [ { x: 'x' }, { y: 'y' } ];
    sinon.stub(es, 'esQuery', (query, cb) => cb(null, mock));
    list(null, null, (error, res) => {
      assert.strictEqual(error, null);
      assert.deepEqual(res, mock);
      es.esQuery.restore();
    });
    done();
  });

  it('gets', (done) => {
    // no records returned
    sinon.stub(es, 'esQuery', (query, cb) => cb(null, []));
    get({ path: { short_name: 'x' }}, null, (error, res) => {
      assert.equal(error, 'Record was not found');
      es.esQuery.restore();
    });

    sinon.stub(es, 'esQuery', (query, cb) => cb(null, [{x: 'x'}]));
    get({ path: { short_name: 'x' }}, null, (error, res) => {
      assert.strictEqual(error, null);
      assert.deepEqual(res, {x: 'x'});
      es.esQuery.restore();
      done();
    });
  });

  it('posts', (done) => {
    sinon.stub(db, 'get', (data, cb) => cb(null, false));
    sinon.stub(db, 'save', (data, cb) => cb(null, 'created'));

    post(null, null, (res) => {
      assert.ok(/invalid/.test(res.toLowerCase()), 'returns error message with empty params');
    });

    post({body: record}, null, (error, res) => {
      sinon.assert.calledOnce(db.get);

      assert.strictEqual(error, null);
      assert.equal(res, 'created');

      db.save.restore();
      db.get.restore();
      done();
    });
  });

  it('puts', (done) => {
    sinon.stub(db, 'get', (data, cb) => cb(null, true));
    sinon.stub(db, 'save', (data, cb) => cb(null, 'updated'));

    put({body: record}, null, (error, res) => {
      sinon.assert.calledOnce(db.get);

      assert.strictEqual(error, null);
      assert.equal(res, 'updated');

      db.save.restore();
      db.get.restore();
      done();
    });
  });
});
