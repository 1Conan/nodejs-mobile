'use strict';

require('../common');
const { WPTRunner } = require('../common/wpt');

const runner = new WPTRunner('webmessaging/broadcastchannel');

runner.runJsTests();
