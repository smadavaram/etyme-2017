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
        prevArrow:"<span class='next btn-sm btn btn-primary'><i class='icon-feather-arrow-left'>Edit Profile</i></span>",
        nextArrow:"<span class='pre btn-sm btn btn-primary'>Upload Resume<i class='icon-feather-arrow-right'></i></span>"
        // autoplay: true,
    });
    $('#slideshow').on('afterChange', function (event, slick, currentSlide) {
        if(currentSlide === 1) {
            $('.slick-next').addClass('display_none');
        }
        else {
            $('.slick-next').removeClass('display_none');
        }

        if(currentSlide === 0) {
            $('.slick-prev').addClass('display_none');
        }
        else {
            $('.slick-prev').removeClass('display_none');
        }
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
