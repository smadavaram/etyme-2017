class DocusignEnvelope
  delegate :url_helpers, to: 'Rails.application.routes'
  attr_accessor :document_sign, :plugin

  def initialize(document_sign, plugin)
    @document_sign = document_sign
    @plugin = plugin
  end

  def get_documents
    docx = []
    @document_sign.documentable.file.split(',').each do |file_url|
      file_name = File.basename(file_url)
      file_ext = File.extname(file_url)
      docx << DocuSign_eSign::Document.new({
                                               :documentBase64 => Base64.encode64(open(file_url).read),
                                               :name => file_name, :fileExtension => file_ext,
                                               :documentId => @document_sign.id
                                           })
    end
    docx
  end


  def get_signers(documents)
    signers = []
    documents.each do |document|
      # create a signer recipient to sign the document, identified by name and email
      # We're setting the parameters via the object creation
      (@document_sign.signers.to_a << @document_sign.signable).each do |signable|
        signer = DocuSign_eSign::Signer.new({:email => signable.email, :name => signable.full_name, :recipientId => signable.id})
        sign_here = DocuSign_eSign::SignHere.new({
                                                     documentId: document.document_id,
                                                     pageNumber: '1',
                                                     recipientId: signable.id,
                                                     tabLabel: 'signHereTabs',
                                                     anchorXOffset: '2',
                                                     anchorYOffset: '0',
                                                     anchorString: 'Please Sign Here:',
                                                     anchorIgnoreIfNotPresent: "true",
                                                     anchorUnits: "inches"
                                                 })
        # Tabs are set per recipient / signer
        signer.tabs = DocuSign_eSign::Tabs.new({:signHereTabs => [sign_here]})
        signers << signer
      end
    end
    signers
  end

  # url: "https://0fa99b3b.ngrok.io#{url_helpers.e_sign_completed_company_document_signs_path}",
  def build_event_notification
    {
        url: "https://#{@document_sign.company.etyme_url}#{url_helpers.e_sign_completed_company_document_signs_path}",
        loggingEnabled: "true",
        requireAcknowledgment: "true",
        useSoapInterface: "false",
        includeCertificateWithSoap: "false",
        signMessageWithX509Cert: "false",
        includeDocuments: "true",
        includeEnvelopeVoidReason: "true",
        includeTimeZone: "true",
        includeSenderAccountAsCustomField: "true",
        includeDocumentFields: "true",
        includeCertificateOfCompletion: "true",
        envelopeEvents: [{"envelopeEventStatusCode": "completed"}],
        recipientEvents: [{"recipientEventStatusCode": "Completed"}]
    }
  end

  def create_envelope
    access_token = @plugin.access_token
    account_id = @plugin.account_id
    base_path = ENV['docusign_envelope_base_path']

    envelope_definition = DocuSign_eSign::EnvelopeDefinition.new
    envelope_definition.email_subject = "Please sign this document sent from Etyme"

    envelope_definition.documents = get_documents
    recipients = DocuSign_eSign::Recipients.new({:signers => get_signers(envelope_definition.documents)})
    envelope_definition.recipients = recipients
    envelope_definition.event_notification = DocuSign_eSign::EventNotification.new(build_event_notification)

    # Request that the envelope be sent by setting |status| to "sent".
    # To request that the envelope be created as a draft, set to "created"
    envelope_definition.status = "sent"

    # Step 2. Call DocuSign with the envelope definition to have the envelope created and sent
    configuration = DocuSign_eSign::Configuration.new
    configuration.host = base_path
    api_client = DocuSign_eSign::ApiClient.new configuration
    api_client.default_headers["Authorization"] = "Bearer " + access_token
    envelopes_api = DocuSign_eSign::EnvelopesApi.new api_client
    results = envelopes_api.create_envelope account_id, envelope_definition
  rescue DocuSign_eSign::ApiError => e
    @error_msg = e.response_body
    results = {
        status: 'errors',
        error_message: @error_msg
    }
    results
  end
end