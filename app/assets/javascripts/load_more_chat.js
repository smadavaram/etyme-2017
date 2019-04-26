jQuery(function() {
    $(".chat-content-scroll").data('ajaxready', true);
    $(".chat-content-scroll").on('scroll', function(e) {
        checkForScrollEvent($(this));
    });
});

listenForScrollEvent = function(el) {
    el.on('scroll', function() {
        checkForScrollEvent($(this));
    });
};

checkForScrollEvent = function(el) {
    var more_users_url;
    more_users_url = void 0;
    if ($(".chat-content-scroll").data('ajaxready') === false) {
        return;
    }
    more_users_url = $('#all-infinite-scrolling-msg .pagination a[rel=next]').attr('href');
    if (more_users_url && el.scrollTop() === 0) {
        $('#loading').removeClass('hidden');
        $(".chat-content-scroll").data('ajaxready', false);
        $.getScript(more_users_url + "&prev_date=" + $("#prev_date").val());
    }
};