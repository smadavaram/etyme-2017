class Company::DocumentSignsController < ApplicationController


  def e_sign_completed
    client = Aws::S3::Client.new(access_key_id: ENV['DO_ACCESS_KEY_ID'], secret_access_key: ENV['DO_SECRET_ACCESS_KEY'], endpoint: "https://#{ENV['DO_REGION']}.digitaloceanspaces.com", region: ENV['DO_REGION'])
    xml_doc = Nokogiri::XML(request.body.read)
    envelope_id = xml_doc.search('EnvelopeStatus > EnvelopeID').text
    @document_sign = DocumentSign.find_by_envelope_id(envelope_id)
    documents = []
    xml_doc.search('DocumentStatuses > DocumentStatus').each do |element|
      documents << {id: element.search("ID").text, name: element.search("Name").text}
    end
    file_urls = []
    documents.each do |document|
      xml_doc.search('DocumentPDFs > DocumentPDF').each do |element|
        if element.search('Name').text.strip == document[:name].strip
          file_name_slug = SecureRandom.hex(10)
          client.put_object({body: Base64.decode64(element.search('PDFBytes').first.text) , bucket: "etyme-cdn", key: file_name_slug+"_"+document[:name], acl: "public-read" })
          file_urls << "https://#{ENV['DO_BUCKET']}.#{ENV['DO_REGION']}.digitaloceanspaces.com/#{file_name_slug+'_'+document[:name]}"
        end
      end
    end
    @document_sign.update(is_sign_done: true,signed_file: file_urls.join(','))
    render json: {status: "ok"}, status: :ok
  end

end