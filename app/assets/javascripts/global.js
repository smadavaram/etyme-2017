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

