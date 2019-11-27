class Company::DocumentSignsController < ApplicationController

  def e_sign_completed
    xml_doc = Nokogiri::XML(request.body.read)
    envelope_id = xml_doc.search('EnvelopeStatus > EnvelopeID').text
    @document_sign = DocumentSign.find_by_envelope_id(envelope_id)
    documents = get_documents(xml_doc)
    file_urls = upload_signed_files_to_s3(documents, xml_doc)
    if @document_sign.update(is_sign_done: true, signed_file: file_urls.join(','))
      notify_signers(xml_doc.search("RecipientStatuses > RecipientStatus"), @document_sign)
    end
    render json: {status: "ok"}, status: :ok
  end

  def upload_document
    @document_sign = DocumentSign.find_by(id: params[:document_sign_id])
    @legal_doc = CompanyLegalDoc.find_by(id: params[:legal_doc_id])
    if @document_sign.update(save_doc: @legal_doc, is_sign_done: true)
      flash[:success] = 'Submitted file from documents'
    else
      flash[:errors] = @document_sign.errors.full_messages
    end
    redirect_back fallback_location: root_path
  end

  def documents
    @document_sign = DocumentSign.find_by(id: params[:document_sign_id])
    @legal_docs = current_company.company_legal_docs
    respond_to do |format|
      format.js {}
    end
  end

  private

  def get_documents(xml_doc)
    documents = []
    xml_doc.search('DocumentStatuses > DocumentStatus').each do |element|
      documents << {id: element.search("ID").text, name: element.search("Name").text}
    end
    documents
  end

  def upload_signed_files_to_s3(documents, xml_doc)
    file_urls = []
    client = Aws::S3::Client.new(access_key_id: ENV['DO_ACCESS_KEY_ID'], secret_access_key: ENV['DO_SECRET_ACCESS_KEY'], endpoint: "https://#{ENV['DO_REGION']}.digitaloceanspaces.com", region: ENV['DO_REGION'])
    documents.each do |document|
      xml_doc.search('DocumentPDFs > DocumentPDF').each do |element|
        if element.search('Name').text.strip == document[:name].strip
          file_name_slug = SecureRandom.hex(10)
          client.put_object({body: Base64.decode64(element.search('PDFBytes').first.text), bucket: "etyme-cdn", key: file_name_slug + "_" + document[:name], acl: "public-read"})
          file_urls << "https://#{ENV['DO_BUCKET']}.#{ENV['DO_REGION']}.digitaloceanspaces.com/#{file_name_slug + '_' + document[:name]}"
        end
      end
    end
    file_urls
  end

  def notify_signers(signers_docs, document_sign)
    signer_status = get_signers(signers_docs)
    debugger
    unless should_notify?(signer_status)
      (document_sign.signers.to_a << document_sign.signable).each do |signer|
        Notification.new(notifiable: signer, createable: document_sign.requested_by,
                         status: :unread, notification_type: :document_request, title: "Document Request",
                         message: "#{signer_status.map { |signer| signer[:user_name] }.join(",")} have signed the document sent through docusign"
        ).save
      end
    end
  end

  def get_signers(signers_docs)
    signers_status = []
    signers_docs.each do |signer|
      email = signer.search("Email").text
      status = signer.search("Status").text
      user_name = signer.search("UserName").text&.capitalize
      signers_status << {email: email, status: status, user_name: user_name}
    end
    signers_status
  end

  def should_notify?(signers_status)
    signers_status.map { |signer| signer[:status] == "CompletedSigned" }.include?(false)
  end

  def get_user(email)
    Candidate.find_by(email: email) || User.find_by(email: email)
  end

end