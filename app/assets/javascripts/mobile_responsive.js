$(document).ready(function(){
    $(".hasDatepicker").attr('autocomplete', 'off');
    $(".os-icon-calendar").css("color", "", "!important");

    $('.os-icon-mail-07').hide();
    $("#ChatBtn").html("<i class='os-icon os-icon-mail-07'></i>");
  $( window ).resize(function()
   {
       $('.os-icon-mail-07').hide();
       $("#ChatBtn").html("<i class='os-icon os-icon-mail-07'></i>");
       if ($(window).width() < 960) {
            $(".trix-button--icon").css("font-size", "9px");
            $(".content-box").css("padding", "0rem");
          }
    });

        $('#accounting_tab').on('click', function (e) {
            var element = document.getElementById("side-bar-nav");
            element.scrollTop = element.scrollHeight;
        });

});


