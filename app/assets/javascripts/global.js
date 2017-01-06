var selector = '.dropdown-menu li';
$(selector).on('click', function(){
    $(selector).removeClass('active');
    $(this).addClass('active');
    $('.textbtn').html($(this).text()+"<span class='caret'></span>");
});

