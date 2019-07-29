class DocusignEnvelope

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
                                               :documentId => "#{@document_sign.id}-#{SecureRandom.hex(5)}"
                                           })
    end
    docx
  end

  def get_signers(documents)
    signers = []
    signer_name = @document_sign.signable.full_name
    signer_email = @document_sign.signable.email
    documents.each do |document|
      # create a signer recipient to sign the document, identified by name and email
      # We're setting the parameters via the object creation
      signer = DocuSign_eSign::Signer.new({:email => signer_email, :name => signer_name, :recipientId => @document_sign.signable.id})
      sign_here = DocuSign_eSign::SignHere.new({
                                                   :documentId => document.document_id,
                                                   :pageNumber => '1',
                                                   :recipientId => '1',
                                                   :tabLabel => 'SignHereTab',
                                                   :xPosition => '195',
                                                   :yPosition => '147'
                                                   # :pageNumber => '1',
                                                   # :recipientId => '1',
                                                   # :tabLabel => 'SignHereTab',
                                                   # :anchor_x_offset => '1',
                                                   # :anchor_y_offset => '0',
                                                   # :anchor_string => 'Please Sign Here:',
                                                   # :anchor_ignore_if_not_present => "false"
                                                   # :anchor_units => "inches"
                                               })
      # Tabs are set per recipient / signer
      tabs = DocuSign_eSign::Tabs.new({:signHereTabs => [sign_here]})
      signer.tabs = tabs
      signers << signer
    end
    signers
  end

  def create_envelope
    access_token = @plugin.access_token
    account_id = ENV['docusign_client_id']
    base_path = ENV['docusign_envelope_base_path']

    envelope_definition = DocuSign_eSign::EnvelopeDefinition.new
    envelope_definition.email_subject = "Please sign this document sent from Etyme"

    envelope_definition.documents = get_documents

    recipients = DocuSign_eSign::Recipients.new({:signers => get_signers(envelope_definition.documents)})
    envelope_definition.recipients = recipients
    # Request that the envelope be sent by setting |status| to "sent".
    # To request that the envelope be created as a draft, set to "created"
    envelope_definition.status = "sent"

    # Step 2. Call DocuSign with the envelope definition to have the envelope created and sent
    configuration = DocuSign_eSign::Configuration.new
    configuration.host = base_path
    api_client = DocuSign_eSign::ApiClient.new configuration
    api_client.default_headers["Authorization"] = "Bearer " + access_token
    envelopes_api = DocuSign_eSign::EnvelopesApi.new api_client
    debugger
    results = envelopes_api.create_envelope account_id, envelope_definition

  rescue DocuSign_eSign::ApiError => e
    @error_msg = e.response_body
    debugger
  end

end