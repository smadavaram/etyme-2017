#encoding: UTF-8

xml.instruct! :xml, :version => "1.0"
xml.rss :version => "2.0" do
  xml.channel do
    xml.title "Etyme Candidates"
    xml.author "Etyme"
    xml.name "Bench Candidate Information"
    xml.link "https://www.etyme.com"
    xml.language "en"
    for candidate in @candidates
      xml.item do
        if candidate.full_name
          xml.name candidate.full_name
        else
          xml.email candidate.email
        end
        xml.pubDate candidate.created_at.to_s(:rfc822)
        xml.link "https://www.codingfish.com/blog/" + candidate.id.to_s + "-"
        xml.guid candidate.id
      end
    end
  end
end
