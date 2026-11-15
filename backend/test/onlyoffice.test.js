const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

process.env.ONLYOFFICE_JWT_SECRET = 'onlyoffice-test-secret';
process.env.BACKEND_URL_FOR_DOCKER = 'http://backend:3000';

const { buildOnlyOfficeConfig } = require('../services/contractAnalysis/onlyoffice');

const contract = {
    id: 42,
    user_id: 7,
    original_filename: '测试合同.pdf',
    storage_path: '/app/uploads/example.pdf',
    document_key: 'contract-key-42',
};

test('PDF editor enables editing, annotations, forms and the full workspace UI', () => {
    const config = buildOnlyOfficeConfig(contract, 'pdf');

    assert.equal(config.documentType, 'pdf');
    assert.equal(config.editorConfig.mode, 'edit');
    assert.deepEqual(config.document.permissions, {
        chat: false,
        comment: true,
        copy: true,
        download: true,
        edit: true,
        fillForms: true,
        modifyContentControl: false,
        modifyFilter: false,
        print: true,
        protect: false,
        review: false,
    });
    assert.equal(config.editorConfig.customization.autosave, true);
    assert.equal(config.editorConfig.customization.forcesave, true);
    assert.equal(config.editorConfig.customization.compactHeader, false);
    assert.equal(config.editorConfig.customization.compactToolbar, false);
    assert.equal(config.editorConfig.customization.toolbarHideFileName, false);
    assert.equal(config.editorConfig.customization.toolbarNoTabs, false);
    assert.equal(config.editorConfig.customization.hideRightMenu, false);
    assert.equal(config.editorConfig.customization.hideRulers, false);
    assert.equal(config.editorConfig.customization.help, true);
    assert.equal(config.editorConfig.customization.plugins, true);

    const decoded = jwt.verify(config.token, process.env.ONLYOFFICE_JWT_SECRET);
    assert.equal(decoded.document.permissions.edit, true);
    assert.equal(decoded.editorConfig.mode, 'edit');
});

test('DOCX editor keeps review and content-control capabilities', () => {
    const config = buildOnlyOfficeConfig({
        ...contract,
        original_filename: '测试合同.docx',
        storage_path: '/app/uploads/example.docx',
    }, 'docx');

    assert.equal(config.documentType, 'word');
    assert.equal(config.editorConfig.mode, 'edit');
    assert.equal(config.document.permissions.review, true);
    assert.equal(config.document.permissions.modifyContentControl, true);
    assert.equal(config.document.permissions.modifyFilter, true);
});
