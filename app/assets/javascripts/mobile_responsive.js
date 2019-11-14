$(document).ready(function(){
    $(".hasDatepicker").attr('autocomplete', 'off');

    $('.os-icon-mail-07').hide();
    $("#ChatBtn").html("<i class='os-icon os-icon-mail-07'></i>");
  $( window ).resize(function()
   {
       $('.os-icon-mail-07').hide();
       $("#ChatBtn").html("<i class='os-icon os-icon-mail-07'></i>");
       if ($(window).width() < 960)
      {  
        $(".trix-button--icon").css("font-size", "9px");
        $(".content-box").css("padding", "0rem");
      }
      else 
      {
          // $('.os-icon-mail-07').hide();
          // $("#ChatBtn").html("<i class='os-icon os-icon-mail-07'></i>"); 
          // $('.os-icon-mail-07').show();
          //  $("#ChatBtn").text("Conversation");    
      }
 
    });
});


