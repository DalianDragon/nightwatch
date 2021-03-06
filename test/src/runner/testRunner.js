const path = require('path');
const fs = require('fs');
const assert = require('assert');
const common = require('../../common.js');
const MockServer = require('../../lib/mockserver.js');
const Globals = require('../../lib/globals.js');
const CommandGlobals = require('../../lib/globals/commands.js');
const Runner = common.require('runner/runner.js');
const Settings = common.require('settings/settings.js');
const NightwatchClient = common.require('index.js');

describe('testRunner', function() {
  const emptyPath = path.join(__dirname, '../../sampletests/empty/testdir');

  before(function(done) {
    this.server = MockServer.init();
    this.server.on('listening', () => {
      fs.mkdir(emptyPath, function(err) {
        if (err) {
          return done();
        }
        done();
      });
    });
  });

  after(function(done) {
    CommandGlobals.afterEach.call(this, function() {
      fs.rmdir(emptyPath, function(err) {
        if (err) {
          return done();
        }
        done();
      });
    });
  });

  beforeEach(function() {
    process.removeAllListeners('exit');
    process.removeAllListeners('uncaughtException');
    process.removeAllListeners('unhandledRejection');
  });

  it('testRunEmptyFolder', function(done) {
    Globals
      .startTestRunner(emptyPath, {
        output_folder: false
      })
      .catch(err => {
        assert.ok(err instanceof Error);
        if (err.message !== `No tests defined! using source folder: ${emptyPath}`) {
          done(err);
        } else {
          done();
        }
      });
  });

  it('testRunEmptySubFolder', function(done) {
    let testsPath = path.dirname(emptyPath);

    Globals
      .startTestRunner(testsPath, {
        output_folder: false
      })
      .catch(err => {
        assert.ok(err instanceof Error);
        if (err.message !== `No tests defined! using source folder: ${testsPath}`) {
          done(err);
        } else {
          done();
        }
      });
  });

  it('testRunNoSrcFoldersArgument', function() {
    let settings = Settings.parse({
      output_folder: false
    });

    assert.throws(function() {
      Runner.readTestSource(settings);
    }, /No test source specified, please check configuration/)
  });

  it('testRunSimple', function() {
    let testsPath = path.join(__dirname, '../../sampletests/simple');
    let globals = {
      reporter(results) {
        assert.ok('test/sample' in results.modules);
        assert.ok('demoTest' in results.modules['test/sample'].completed);

        if (results.lastError) {
          throw results.lastError;
        }
      }
    };

    return NightwatchClient.runTests(testsPath, {
      selenium: {
        port: 10195,
        version2: true,
        start_process: true
      },
      output: false,
      persist_globals: true,
      globals: globals,
      output_folder: false
    });
  });

  it('testRunWithJUnitOutputAndFailures', function () {

    let testsPath = [
      path.join(__dirname, '../../sampletests/withfailures')
    ];

    let settings = {
      selenium: {
        port: 10195,
        version2: true,
        start_process: true
      },
      output_folder: 'output',
      silent: false,
      globals: {
        waitForConditionPollInterval: 20,
        waitForConditionTimeout: 50,
        retryAssertionTimeout: 50,
        reporter: function () {
        }
      },
      output: true,
      screenshots: {
        enabled: true,
        on_failure: true,
        on_error: true,
        path: ''
      }
    };

    MockServer.addMock({
      url : '/wd/hub/session/1352110219202/screenshot',
      method:'GET',
      response : JSON.stringify({
        sessionId: '1352110219202',
        status:0,
        value:'screendata'
      })
    });


    return NightwatchClient.runTests(testsPath, settings)
      .then(_ => {
        return readFilePromise('output/FIREFOX_TEST_TEST_sample.xml');
      })
      .then(data => {
        let content = data.toString();
        assert.ok(content.indexOf('<system-out>[[ATTACHMENT|') > 0);
      });
  });

  it('testRunWithJUnitOutput', function() {
    let testsPath = [
      path.join(__dirname, '../../sampletests/withsubfolders')
    ];

    let settings = {
      selenium: {
        port: 10195,
        version2: true,
        start_process: true
      },
      output_folder: 'output',
      silent: true,
      globals: {reporter: function() {}},
      output: false
    };

    return NightwatchClient.runTests(testsPath, settings)
      .then(_ => {
        return readDirPromise(testsPath[0]);
      })
      .then(list => {
        let simpleReportFile = 'output/simple/FIREFOX_TEST_TEST_sample.xml';
        let tagsReportFile = 'output/tags/FIREFOX_TEST_TEST_sampleTags.xml';

        assert.deepEqual(list, ['simple', 'tags'], 'The subfolders have not been created.');
        assert.ok(fileExistsSync(simpleReportFile), 'The simple report file was not created.');
        assert.ok(fileExistsSync(tagsReportFile), 'The tags report file was not created.');

        return readFilePromise(simpleReportFile);
      })
      .then(data => {
        let content = data.toString();
        assert.ok(/<testsuite[\s]+name="simple\.sample"[\s]+errors="0"[\s]+failures="0"[\s]+hostname=""[\s]+id=""[\s]+package="simple"[\s]+skipped="0"[\s]+tests="1"/.test(content),
          'Report does not contain correct testsuite information.');

        assert.ok(/<testcase[\s]+name="simpleDemoTest"[\s]+classname="simple\.sample"[\s]+time="[.\d]+"[\s]+assertions="1">/.test(content),
          'Report does not contain the correct testcase element.');
      });
  });

  it('test Runner with ES6 async/await tests', function() {
    let testsPath = path.join(__dirname, '../../sampletests/es6await');
    MockServer.addMock({
      url: '/wd/hub/session/1352110219202/cookie',
      method: 'GET',
      response: JSON.stringify({
        sessionId: '1352110219202',
        status: 0,
        value: [{
          name: 'test_cookie',
          value: '123456',
          path: '/',
          domain: 'example.org',
          secure: false,
          class: 'org.openqa.selenium.Cookie',
          hCode: 91423566
        }]
      })
    }, true);

    let globals = {
      waitForConditionPollInterval: 50,

      reporter(results) {
        assert.ok('failures/sampleWithFailures' in results.modules, 'sampleWithFailures module not found in results');
        assert.ok('basicSampleTest' in results.modules);
        if (results.modules.basicSampleTest.lastError) {
          throw results.modules.basicSampleTest.lastError;
        }

        if (results.modules['failures/sampleWithFailures'].completed.asyncGetCookiesTest.lastError) {
          throw results.modules['failures/sampleWithFailures'].completed.asyncGetCookiesTest.lastError;
        }

        assert.ok(results.lastError instanceof Error);
        assert.ok(results.lastError.message.includes('is present in 15 ms.'));
        assert.strictEqual(results.lastError.name, 'NightwatchAssertError');
      }
    };

    return NightwatchClient.runTests(testsPath, {
      selenium: {
        port: 10195,
        version2: true,
        start_process: true
      },
      output: true,
      skip_testcases_on_fail: false,
      silent: false,
      persist_globals: true,
      globals: globals,
      output_folder: false
    });
  });
});

function readFilePromise(fileName) {
  return new Promise(function(resolve, reject) {
    fs.readFile(fileName, function(err, result) {
      if (err) {
        return reject(err);
      }

      resolve(result);
    });
  });
}

function readDirPromise(dirName) {
  return new Promise(function(resolve, reject) {
    fs.readdir(dirName, function(err, result) {
      if (err) {
        return reject(err);
      }

      resolve(result);
    });
  });
}

// util to replace deprecated fs.existsSync
function fileExistsSync(path) {
  try {
    fs.statSync(path);
    return true;
  } catch (e) {
    return false;
  }
}
