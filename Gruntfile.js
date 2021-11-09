// Copyright 2014-2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

const { join } = require('path');
const importOnce = require('node-sass-import-once');
const rimraf = require('rimraf');
const mkdirp = require('mkdirp');
const spectron = require('spectron');
const asar = require('asar');
const fs = require('fs');
const os = require('os');
const assert = require('assert');
const sass = require('node-sass');
const packageJson = require('./package.json');

/* eslint-disable more/no-then, no-console  */

module.exports = grunt => {
  async function promiseToAsyncGruntTask(promise, gruntDone) {
    let succeeded = false;
    try {
      await promise;
      succeeded = true;
    } catch (err) {
      grunt.log.error(err);
    }
    if (succeeded) {
      gruntDone();
    } else {
      gruntDone(false);
    }
  }

  const bower = grunt.file.readJSON('bower.json');
  const components = [];
  // eslint-disable-next-line guard-for-in, no-restricted-syntax
  for (const i in bower.concat.app) {
    components.push(bower.concat.app[i]);
  }

  grunt.loadNpmTasks('grunt-sass');

  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    concat: {
      components: {
        src: components,
        dest: 'js/components.js',
      },
      test: {
        src: [
          'node_modules/mocha/mocha.js',
          'node_modules/chai/chai.js',
          'test/_test.js',
        ],
        dest: 'test/test.js',
      },
      libtextsecuretest: {
        src: [
          'node_modules/jquery/dist/jquery.js',
          'node_modules/mocha/mocha.js',
          'node_modules/chai/chai.js',
          'libtextsecure/test/_test.js',
        ],
        dest: 'libtextsecure/test/test.js',
      },
    },
    sass: {
      options: {
        implementation: sass,
        sourceMap: true,
        importer: importOnce,
      },
      dev: {
        files: {
          'stylesheets/manifest.css': 'stylesheets/manifest.scss',
          'stylesheets/manifest_bridge.css': 'stylesheets/manifest_bridge.scss',
        },
      },
    },
    copy: {
      deps: {
        files: [
          {
            src: 'components/mp3lameencoder/lib/Mp3LameEncoder.js',
            dest: 'js/Mp3LameEncoder.min.js',
          },
          {
            src: 'components/webaudiorecorder/lib/WebAudioRecorderMp3.js',
            dest: 'js/WebAudioRecorderMp3.js',
          },
        ],
      },
    },
    watch: {
      protobuf: {
        files: ['./protos/SignalService.proto'],
        tasks: ['exec:build-protobuf'],
      },
      sass: {
        files: ['./stylesheets/*.scss', './stylesheets/**/*.scss'],
        tasks: ['sass'],
      },
    },
    exec: {
      'tx-pull-mostly-translated': {
        cmd: 'tx pull --all --use-git-timestamps --minimum-perc=80',
      },
      'tx-pull-any-existing-translation': {
        cmd: 'tx pull --use-git-timestamps',
      },
      transpile: {
        cmd: 'yarn transpile',
      },
      'build-protobuf': {
        cmd: 'yarn build-protobuf',
      },
    },
    'test-release': {
      osx: {
        archive: `mac/${packageJson.productName}.app/Contents/Resources/app.asar`,
        exe: `mac/${packageJson.productName}.app/Contents/MacOS/${packageJson.productName}`,
      },
      mas: {
        archive: 'mas/Signal.app/Contents/Resources/app.asar',
        exe: `mas/${packageJson.productName}.app/Contents/MacOS/${packageJson.productName}`,
      },
      linux: {
        archive: 'linux-unpacked/resources/app.asar',
        exe: `linux-unpacked/${packageJson.name}`,
      },
      win: {
        archive: 'win-unpacked/resources/app.asar',
        exe: `win-unpacked/${packageJson.productName}.exe`,
      },
    },
    gitinfo: {}, // to be populated by grunt gitinfo
  });

  Object.keys(grunt.config.get('pkg').devDependencies).forEach(key => {
    if (/^grunt(?!(-cli)?$)/.test(key)) {
      // ignore grunt and grunt-cli
      grunt.loadNpmTasks(key);
    }
  });

  // Transifex does not understand placeholders, so this task patches all non-en
  // locales with missing placeholders
  grunt.registerTask('locale-patch', () => {
    const en = grunt.file.readJSON('_locales/en/messages.json');
    grunt.file.recurse('_locales', (abspath, rootdir, subdir, filename) => {
      if (subdir === 'en' || filename !== 'messages.json') {
        return;
      }
      const messages = grunt.file.readJSON(abspath);

      // eslint-disable-next-line no-restricted-syntax
      for (const key in messages) {
        if (en[key] !== undefined && messages[key] !== undefined) {
          if (
            en[key].placeholders !== undefined &&
            messages[key].placeholders === undefined
          ) {
            messages[key].placeholders = en[key].placeholders;
          }
        }
      }

      grunt.file.write(abspath, `${JSON.stringify(messages, null, 4)}\n`);
    });
  });

  grunt.registerTask('getExpireTime', () => {
    grunt.task.requires('gitinfo');
    const gitinfo = grunt.config.get('gitinfo');
    const committed = gitinfo.local.branch.current.lastCommitTime;
    const buildCreation = Date.parse(committed);
    const buildExpiration = buildCreation + 1000 * 60 * 60 * 24 * 90;
    grunt.file.write(
      'config/local-production.json',
      `${JSON.stringify({ buildCreation, buildExpiration })}\n`
    );
  });

  grunt.registerTask('clean-release', () => {
    rimraf.sync('release');
    mkdirp.sync('release');
  });

  async function runTests(environment) {
    const { Application } = spectron;
    const electronBinary =
      process.platform === 'win32' ? 'electron.cmd' : 'electron';

    const path = join(__dirname, 'node_modules', '.bin', electronBinary);
    const args = [join(__dirname, 'app', 'main.js')];
    grunt.log.writeln('Starting path', path, 'with args', args);
    const app = new Application({
      path,
      args,
      env: {
        NODE_ENV: environment,
      },
      requireName: 'unused',
      startTimeout: 30000,
    });

    function getMochaResults() {
      // eslint-disable-next-line no-undef
      return window.mochaResults;
    }

    async function logForFailure() {
      const temporaryDirectory = join(
        os.tmpdir(),
        `Signal-Desktop-tests--${Date.now()}-${Math.random()
          .toString()
          .slice(2)}`
      );
      const renderProcessLogPath = join(
        temporaryDirectory,
        'render-process.log'
      );
      const mainProcessLogPath = join(temporaryDirectory, 'main-process.log');

      await fs.promises.mkdir(temporaryDirectory, { recursive: true });

      await Promise.all([
        (async () => {
          const logs = await app.client.getRenderProcessLogs();
          await fs.promises.writeFile(
            renderProcessLogPath,
            logs.map(log => JSON.stringify(log)).join('\n')
          );
        })(),
        (async () => {
          const logs = await app.client.getMainProcessLogs();
          await fs.promises.writeFile(mainProcessLogPath, logs.join('\n'));
        })(),
      ]);

      console.error();
      grunt.log.error(
        `Renderer process logs written to ${renderProcessLogPath}`
      );
      grunt.log.error(`Renderer process logs written to ${mainProcessLogPath}`);
      grunt.log.error(
        `For easier debugging, try NODE_ENV='${environment}' yarn start`
      );
      console.error();
    }

    try {
      await app.start();

      grunt.log.writeln('App started. Now waiting for test results...');
      await app.client.waitUntil(
        () =>
          app.client.execute(getMochaResults).then(data => Boolean(data.value)),
        25000,
        'Expected to find window.mochaResults set!'
      );

      const results = (await app.client.execute(getMochaResults)).value;
      if (!results) {
        await logForFailure();
        throw new Error("Couldn't extract test results");
      }

      if (results.failures > 0) {
        const errorMessage = `Found ${results.failures} failing test${
          results.failures === 1 ? '' : 's'
        }.`;
        grunt.log.error(errorMessage);
        results.reports.forEach(report => {
          grunt.log.error(JSON.stringify(report, null, 2));
        });
        await logForFailure();
        throw new Error(errorMessage);
      }

      grunt.log.ok(`${results.passes} tests passed.`);
    } finally {
      if (app.isRunning()) {
        await app.stop();
      }
    }
  }

  grunt.registerTask(
    'unit-tests',
    'Run unit tests w/Electron',
    function thisNeeded() {
      const environment = grunt.option('env') || 'test';
      promiseToAsyncGruntTask(runTests(environment), this.async());
    }
  );

  grunt.registerTask(
    'lib-unit-tests',
    'Run libtextsecure unit tests w/Electron',
    function thisNeeded() {
      const environment = grunt.option('env') || 'test-lib';
      promiseToAsyncGruntTask(runTests(environment), this.async());
    }
  );

  grunt.registerMultiTask(
    'test-release',
    'Test packaged releases',
    function thisNeeded() {
      const dir = grunt.option('dir') || 'release';
      const environment = grunt.option('env') || 'production';
      const config = this.data;
      const archive = [dir, config.archive].join('/');
      const files = [
        'config/default.json',
        `config/${environment}.json`,
        `config/local-${environment}.json`,
      ];

      console.log(this.target, archive);
      const releaseFiles = files.concat(config.files || []);
      releaseFiles.forEach(fileName => {
        console.log(fileName);
        try {
          asar.statFile(archive, fileName);
          return true;
        } catch (e) {
          console.log(e);
          throw new Error(`Missing file ${fileName}`);
        }
      });

      if (config.appUpdateYML) {
        const appUpdateYML = [dir, config.appUpdateYML].join('/');
        if (fs.existsSync(appUpdateYML)) {
          console.log('auto update ok');
        } else {
          throw new Error(`Missing auto update config ${appUpdateYML}`);
        }
      }

      const done = this.async();
      // A simple test to verify a visible window is opened with a title
      const { Application } = spectron;

      const path = [dir, config.exe].join('/');
      console.log('Starting path', path);
      const app = new Application({
        path,
      });

      const sleep = millis =>
        new Promise(resolve => setTimeout(resolve, millis));

      Promise.race([app.start(), sleep(15000)])
        .then(() => {
          if (!app.isRunning()) {
            throw new Error('Application failed to start');
          }

          return app.client.getWindowCount();
        })
        .then(count => {
          assert.equal(count, 1);
          console.log('window opened');
        })
        .then(() =>
          // Verify the window's title
          app.client.waitUntil(
            async () =>
              (await app.client.getTitle()) === packageJson.productName,
            {
              timeoutMsg: `Expected window title to be ${JSON.stringify(
                packageJson.productName
              )}`,
            }
          )
        )
        .then(() => {
          console.log('title ok');
        })
        .then(() => {
          assert(
            app.chromeDriver.logLines.indexOf(`NODE_ENV ${environment}`) > -1
          );
          console.log('environment ok');
        })
        .then(
          () =>
            // Successfully completed test
            app.stop(),
          error =>
            // Test failed!
            app.stop().then(() => {
              grunt.fail.fatal(`Test failed: ${error.message} ${error.stack}`);
            })
        )
        .catch(error => {
          console.log('Main process logs:');
          app.client.getMainProcessLogs().then(logs => {
            logs.forEach(log => {
              console.log(log);
            });

            // Test failed!
            grunt.fail.fatal(`Failure! ${error.message} ${error.stack}`);
          });
        })
        .then(done);
    }
  );

  grunt.registerTask('tx', [
    'exec:tx-pull-mostly-translated',
    'exec:tx-pull-any-existing-translation',
    'locale-patch',
  ]);
  grunt.registerTask('dev', ['default', 'watch']);
  grunt.registerTask('test', ['unit-tests', 'lib-unit-tests']);
  grunt.registerTask('date', ['gitinfo', 'getExpireTime']);
  grunt.registerTask('default', [
    'exec:build-protobuf',
    'exec:transpile',
    'concat',
    'copy:deps',
    'sass',
    'date',
  ]);
};
