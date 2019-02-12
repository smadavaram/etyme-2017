"use strict";

function FlashManager() {
  this.flash = $('[data-dynamic-flash=true]');
}

FlashManager.prototype.resetFlash = function() {
  this.flash.removeClass('alert-success')
            .removeClass('alert-danger');
};

FlashManager.prototype.show = function(message, classname) {
  this.resetFlash();
  this.flash.find('[data-alert-message=true]').text(message);
  this.flash.addClass(classname).slideDown(function(){
    var _this = $(this);
    setTimeout(function(){
      _this.slideUp();
    }, 5000)
  });
};
