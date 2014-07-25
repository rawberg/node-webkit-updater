var ncp = require('ncp'),
    expect = require('chai').expect,
    spawn = require('child_process').spawn,
    exec = require('child_process').exec,
    express = require('express'),
    chokidar = require('chokidar'),
    isWin = /^win/.test(process.platform),
    isMac = /^darwin/.test(process.platform),
    isLinux = /^linux/.test(process.platform),
    path = require('path'),
    fs = require('fs'),
    getPort = require('get-port');
    port = null;

ncp.limit = 100;
console.log(__dirname);

describe('build app: copy current to temp', function buildApp() {
    this.timeout(200000);

    before(function (done) {
        ncp('./app', './test/app', function (err) {
            if (err) return done(err);
            getPort(function (err, availablePort) {
                if (err) return done(err);
                port = availablePort;
                done();
            })
        });
    });

    describe('change manifest, build from temp', function () {
        before(function (done) {
            var mock = {
                manifestUrl: "http://localhost:" + port + "/package.json",
                packages: {
                    mac: "http://localhost:" + port + "/releases/updapp/mac/updapp.dmg",
                    win: "http://localhost:" + port + "/releases/updapp/win/updapp.zip",
                    linux32: "http://localhost:" + port + "/releases/updapp/linux32/updapp.tar.gz",
                    linux64: "http://localhost:" + port + "/releases/updapp/linux64/updapp.tar.gz"
                },
                updated: true,
                version: "0.0.2"
            };

            customizePackageJson(mock, __dirname + '/app/package.json');
            var base = path.normalize(__dirname);
            var bd = spawn('node', ['./node_modules/grunt-cli/bin/grunt', 'buildapp',
                    '--dest=' + base + '/deploy0.2',
                    '--src=' + base + '/app']);

            bd.stdout.on('data', function (data) {
                console.log(data.toString());
            });

            bd.stderr.on('data', function (data) {
                console.log(data.toString());
            });

            bd.on('close', function (code) {
                expect(code).to.equal(0);
                done();
            });
        });

        describe('package for [current os]', function () {
            before(function (done) {

                var pkgCommand;
                if (isMac) pkgCommand = 'packageMac';
                if (isWin) pkgCommand = 'compress:win';
                if (isLinux) pkgCommand = 'compress:linux' + (process.arch == 'ia32' ? '32' : '64');
                console.log(pkgCommand);

                var pk = spawn('node', ['./node_modules/grunt-cli/bin/grunt', pkgCommand, '--dest=./test/deploy0.2', '--src=./test/app']);

                pk.stdout.on('data', function (data) {
                    console.log(data.toString());
                });

                pk.on('close', function (code) {
                    expect(code).to.equal(0);
                    done();
                });
            });

            describe('change manifest, build from temp', function () {
                before(function (done) {
                    var mock = {
                        updated: false,
                        version: "0.0.1"
                    };

                    customizePackageJson(mock, __dirname + '/app/package.json');
                    var bd = spawn('node', ['./node_modules/grunt-cli/bin/grunt', 'buildapp', '--dest=./test/deploy0.1', '--src=./test/app']);

                    bd.stdout.on('data', function (data) {
                        console.log(data.toString());
                    });

                    bd.on('close', function (code) {
                        expect(code).to.equal(0);
                        done();
                    });
                });

                describe('run built app for [os], wait for app to be updated', function () {
                    before(function (done) {
                        var json = {
                            version: "0.0.2"
                        };

                        fs.writeFileSync(__dirname + "/deploy0.2/package.json", JSON.stringify(json, null, 4));
                        app = express();
                        app.use(express.static('./test/deploy0.2'));
                        app.listen(port);
                        done();
                    });

                    it('should be updated', function (done) {
                        var os = {
                            mac: {
                                dir: 'mac/',
                                run: 'open ' + __dirname + "/deploy0.1/releases/updapp/mac/updapp.app"
                            },
                            win: {
                                dir: 'win/',
                                run: path.join(__dirname, "/deploy0.1/releases/updapp/win/updapp/updapp.exe")
                            },
                            linux32: {
                                dir: 'linux32/',
                                run: __dirname + "/deploy0.1/releases/updapp/linux32/updapp/updapp"
                            },
                            linux64: {
                                dir: 'linux64/',
                                run: __dirname + "/deploy0.1/releases/updapp/linux64/updapp/updapp"
                            }
                        };

                        if (isMac) os = os.mac;
                        if (isWin) os = os.win;
                        if (isLinux) os = os['linux' + (process.arch == 'ia32' ? '32' : '64')];
                        console.log(os.run);

                        var watcher = chokidar.watch(__dirname + '/deploy0.1/releases/updapp/' + os.dir);
                        var wasDone = false;
                        watcher.on('change', function () {
                            if (!wasDone) {
                                console.log("original folder was changed");
                                wasDone = true;
                                done();
                            }
                        });

                        exec(os.run, function (err, stdo, stder) {
                            console.log(arguments);
                            console.log("opened and updated");
                        });
                    });
                });
            });
        });
    });
});

function customizePackageJson(obj, path) {
    var json = require(path);

    for (var i in obj) {
        json[i] = obj[i];
    }

    fs.writeFileSync(path, JSON.stringify(json, null, 4));
}
//build app
//serve from url dmg
//check app ver
//update served version
//wait
//check app ver updated