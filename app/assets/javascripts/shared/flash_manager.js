"use strict";

function FlashManager() {
  this.flash = $('[data-dynamic-flash=true]');
}

FlashManager.prototype.show = function(message, classname) {
  this.flash.find('[data-alert-message=true]').text(message);
  this.flash.addClass(classname).slideDown(function(){
    var _this = $(this);
    setTimeout(function(){
      _this.slideUp();
    }, 5000)
  });
};
