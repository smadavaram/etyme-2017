# frozen_string_literal: true

xml.instruct! :xml, version: '1.0'
xml.rss version: '2.0' do
  xml.channel do
    xml.title 'Etyme Jobs'
    xml.author 'Etyme'
    xml.description 'Job Description'
    xml.link 'https://www.etyme.com'
    xml.language 'en'

    @jobs.each do |job|
      xml.item do
        if job.title
          xml.title job.title
        else
          xml.title ''
        end
        xml.createdBy job.created_by.full_name
        xml.pubDate job.created_at.to_s(:rfc822)
        xml.link 'https://www.etyme.com/static/jobs/' + job.id.to_s
        xml.guid job.id

        text = job.description
        # if you like, do something with your content text here e.g. insert image tags.
        # Optional. I'm doing this on my website.
        # if job.image.exists?
        #     image_url = job.image.url(:large)
        #     image_caption = job.image_caption
        #     image_align = ""
        #     image_tag = "
        #         <p><img src='" + image_url +  "' alt='" + image_caption + "' title='" + image_caption + "' align='" + image_align  + "' /></p>
        #       "
        #     text = text.sub('{image}', image_tag)
        # end
        xml.description '<p>' + text + '</p>'
      end
    end
  end
end
