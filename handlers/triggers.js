'use strict';

var triggers = require('../src/triggers');

module.exports.trigger = function (event, context, cb) {
  triggers.trigger(event.dataset, cb);
};
