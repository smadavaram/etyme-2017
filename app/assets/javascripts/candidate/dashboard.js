$(document).ready(function()
{
    $(".close_slick").click(function() {
        $('.popup-backgroud').hide();
        $('.popup-container').hide()
    })

    $("#slideshow").slick({
        infinite: false,
        autoplaySpeed: 2000,
        arrows: true,
        prevArrow:"<span class='pre'> <i class='icon-feather-arrow-right'>Previous</i></span>",
        nextArrow:"<span class='next icon-feather-arrow-left'>Next</span>"
        // autoplay: true,
    });

    $('.jobs_pagination_links a').attr('data-remote','true');
    $('#custom_range').daterangepicker({
        startDate: moment().startOf('month'),
        endDate: moment().endOf('month'),
        locale: {
            format: 'DD/MM/YYYY'
        }

    });

    $("#custom_range").change(function(){
        url = "/candidate/filter_data/period?start_date=" + $(this).val().replace(/\s+/g, "").split('-').join("&end_date=")
        $.get(url);
    });
    $("#jobs_search").on('change',function(){
        url = "/candidate?q="+$(this).val()
        $.get(url);
    });
});