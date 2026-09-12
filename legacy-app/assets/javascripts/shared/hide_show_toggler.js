"use strict";

function HideShowToggler(triggerButtons) {
  this.triggerButtons = triggerButtons;
}

HideShowToggler.prototype.divSelector = function(data) {
  return ("[data-" + data + "=true]");
};

HideShowToggler.prototype.bindEvents = function() {
  var _this = this;

  this.triggerButtons.on('click', function(){
    var targetSelector = $(this).data('show'),
      targetDiv = $(_this.divSelector(targetSelector));
    targetDiv.toggle();
  });
};

HideShowToggler.prototype.init = function() {
  this.bindEvents();
};
