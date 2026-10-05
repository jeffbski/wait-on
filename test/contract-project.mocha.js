'use strict';

// The pure helpers behind the consumer contract's cucumber hooks (features/support/project.js).

const path = require('path');
const { describe, it } = require('mocha');
const { expect } = require('chai');
const { packageSource, fixtureOf, installArgs, scrubbed } = require('../features/support/project');

describe('contract project helpers', function () {
  describe('packageSource', function () {
    it('should pack the working tree when no package is given', function () {
      expect(packageSource(undefined, '/repo')).to.deep.equal({ pack: true });
    });

    it('should resolve a .tgz value to an absolute tarball path', function () {
      const cwd = path.resolve('/repo');
      expect(packageSource('out/wait-on-10.0.0-rc.1.tgz', cwd)).to.deep.equal({
        tgz: path.join(cwd, 'out', 'wait-on-10.0.0-rc.1.tgz')
      });
    });

    it('should treat any other value as an npm spec', function () {
      expect(packageSource('wait-on@9.5.1', '/repo')).to.deep.equal({ spec: 'wait-on@9.5.1' });
    });
  });

  describe('fixtureOf', function () {
    it('should read the fixture from a @fixture tag', function () {
      expect(fixtureOf(['@consumer', '@fixture:esm'])).to.equal('esm');
    });

    it('should default to cjs without a @fixture tag', function () {
      expect(fixtureOf(['@api'])).to.equal('cjs');
    });

    it('should throw naming both fixtures when a scenario has two @fixture tags', function () {
      expect(() => fixtureOf(['@fixture:esm', '@fixture:ts'])).to.throw(/esm.*ts/);
    });
  });

  describe('installArgs', function () {
    const tgz = path.resolve('/packs/wait-on-10.0.0-rc.1.tgz');

    it('should install the tarball and the locked @types/node into the ts project', function () {
      const args = installArgs('ts', { tgz }, '26.6.3');
      expect(args).to.include.members(['install', '--ignore-scripts', '--no-audit', '--no-fund', tgz, '@types/node@26.6.3']);
    });

    it('should install no @types/node into the cjs project', function () {
      const args = installArgs('cjs', { tgz }, '26.6.3');
      expect(args).to.include(tgz);
      expect(args.some((a) => a.startsWith('@types/node'))).to.equal(false);
    });

    it('should install an npm spec as given', function () {
      expect(installArgs('esm', { spec: 'wait-on@9.5.1' }, '26.6.3')).to.include('wait-on@9.5.1');
    });
  });

  describe('scrubbed', function () {
    it('should drop proxy variables in either case, npm proxy config included, and keep the rest', function () {
      const env = {
        PATH: '/bin',
        HTTP_PROXY: 'http://p:1',
        https_proxy: 'http://p:2',
        ALL_PROXY: 'http://p:3',
        all_proxy: 'http://p:4',
        NO_PROXY: 'localhost',
        no_proxy: 'localhost',
        npm_config_proxy: 'http://p:5',
        NPM_CONFIG_HTTPS_PROXY: 'http://p:6',
        npm_config_http_proxy: 'http://p:7',
        npm_config_no_proxy: 'localhost'
      };
      expect(scrubbed(env)).to.deep.equal({ PATH: '/bin' });
      expect(env).to.have.property('HTTP_PROXY');
    });
  });
});
