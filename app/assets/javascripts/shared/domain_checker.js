//= require shared/flash_manager
/* globals FlashManager */
"use strict";

function DomainChecker(options, container) {
  this.container             = $(container);
  this.url                   = this.container.data('url');
  this.domainField           = this.container.find(options.domainFieldSelector);
  this.emailField            = this.container.find(options.emailFieldSelector);
  this.websiteField          = this.container.find(options.websiteFieldSelector);
  this.alertMessageContainer = this.container.find(options.alertMessageContainer);
  this.defaultErrorMessage   = this.container.data(options.errorMessageAttribute);
  this.nameField             = this.container.find(options.nameFieldSelector);
  this.companyTypeField      = this.container.find(options.companyTypeSelector);
  this.phoneField            = this.container.find(options.phoneSelector)
  this.flashManager          = new FlashManager();
}

DomainChecker.prototype.checkForAvailableDomain = function(emailFieldValue) {
  var _this = this;

  $.ajax({
    type: 'GET',
    url: _this.url,
    dataType: 'json',
    data: { email: emailFieldValue },

    success: function(response) {
      if(response.status == "ok"){
        _this.domainField.val(response.slug);
        _this.websiteField.val(response.website);
        _this.nameField.val(response.name);
        _this.companyTypeField.val(response.company_type);
        _this.domainField.prop('readonly', true);
        _this.websiteField.prop('readonly', true);
        if (response.registred_in_company == false){
          _this.phoneField.val(response.phone);
          _this.domainField.prop('readonly', false);
          _this.websiteField.prop('readonly', false);
          _this.flashManager.hide()
        }
        else{
          _this.flashManager.show(response.message, 'alert-success');
        }
      }else if(response.status == "unprocessible_entity"){
        _this.domainField.val(response.slug);
        _this.websiteField.val(response.website);
        _this.nameField.val(response.name);
        _this.companyTypeField.val(response.company_type);
        _this.domainField.prop('readonly', true);
        _this.websiteField.prop('readonly', true);
        _this.nameField.prop('readonly', true);
        _this.companyTypeField.prop('disabled', 'disabled');
        _this.flashManager.show(response.message, 'alert-danger');
      }else {
        _this.domainField.val('');
        _this.flashManager.show(response.message, 'alert-danger');
      }
    },

    error: function(error) {
      _this.domainField.val('');
      alert(_this.defaultErrorMessage);
    }
  });
};

DomainChecker.prototype.bindEvents = function() {
  var _this = this;
  this.emailField.on('change', function(){
    if($(this).val()){
      _this.checkForAvailableDomain($(this).val());
    }
  });
};

DomainChecker.prototype.init = function() {
  this.bindEvents();
};


$(document).ready(function(){
  var options = {
    domainFieldSelector   : '[data-domain-field=true]',
    emailFieldSelector    : '[data-email-field=true]',
    alertMessageContainer : '[data-alert-message=true]',
    websiteFieldSelector  : '[data-website-field=true]',
    nameFieldSelector     : '[data-name-field=true]',
    companyTypeSelector   : '[data-company-type-field=true]',
    phoneSelector         : '[data-phone-field=true]',
    errorMessageAttribute : 'default-error-message'
  },
    container = $('[data-domain-checker-form=true]');

  $.each(container, function(_index, element){
    var domainChecker = new DomainChecker(options, element);
    domainChecker.init();
  });
})
