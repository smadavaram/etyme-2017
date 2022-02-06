module MetaTagsHelper
  def meta_title
    content_for?(:meta_title) ? content_for(:meta_title) : "Etyme"
  end

  def meta_description
    content_for?(:meta_description) ? content_for(:meta_description) : "Etyme - Onboard Consultants in 24hrs or less. Curated by world class recruiters & AI."
  end


  def meta_url
    content_for?(:meta_url) ? content_for(:meta_url) : request.original_url
  end
  def meta_image
    meta_image = (content_for?(:meta_image) ? content_for(:meta_image) :"og.jpg")
    #  helps make the image work with both assets and url
    meta_image.starts_with?("http") ? meta_image : image_url(meta_image)
  end

  def remove_html(text)
    ActionView::Base.full_sanitizer.sanitize(text)
  end
end
