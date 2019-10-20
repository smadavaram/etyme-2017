var selector = '.dropdown-menu li';
$(selector).on('click', function(){
    $(selector).removeClass('active');
    $(this).addClass('active');
    $('.textbtn').html($(this).text()+"<span class='caret'></span>");
});

(function($) {
    $.fn.equalHeights = function() {
        var maxHeight = 0,
            $this = $(this);

        $this.each( function() {
            var height = $(this).innerHeight();

            if ( height > maxHeight ) { maxHeight = height; }
        });

        return $this.css('height', maxHeight);
    };

    // auto-initialize plugin
    $('[data-equal]').each(function(){
        var $this = $(this),
            target = $this.data('equal');
        $this.find(target).equalHeights();
    });

})(jQuery);

    document.onreadystatechange = function () {
        var state = document.readyState
        if (state == 'interactive') {
            // document.getElementById('contents').style.visibility="hidden";
        } else if (state == 'complete') {
            setTimeout(function(){
                //document.getElementById('interactive');
                $('#load').css("visibility", "hidden");
                // document.getElementById('contents').style.visibility="visible";
            },1000);
        }
    }

$(document).ready(function(){
  $( window ).resize(function()
   {
        if ($(window).width() < 960) 
        {
          $('.os-icon-mail-07').hide();
          $("#ChatBtn").html("<i class='os-icon os-icon-mail-07'></i>");   
        }
        else 
        {
            $('.os-icon-mail-07').show();
          $("#ChatBtn").text("Conversation");    
        }
      // $('.os-icon-mail-07').show();
      // $(".ChatBtn").text("Conversation");
    });
});

