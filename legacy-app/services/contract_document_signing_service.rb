# frozen_string_literal: true

class ContractDocumentSigningService
  attr_reader :company, :user, :plugin

  def initialize(company:, user:)
    @company = company
    @user = user
    @plugin = company.plugins.first
  end

  def sign_documents_for_buy_contract(buy_contract, doc_ids:, signers: nil)
    company_candidate_docs = company.company_candidate_docs.where(id: doc_ids)
    return failure('Docusign plugin not configured') unless plugin

    unless token_valid?
      response = RefreshToken.new(plugin).refresh_docusign_token
      return failure('Docusign token request failed, please regenerate the token from integrations') unless response.present?
    end

    results = company_candidate_docs.map do |sign_doc|
      document_sign = company.document_signs.create(
        requested_by: user,
        documentable: sign_doc,
        signable: buy_contract.contract.candidate,
        is_sign_done: false,
        part_of: buy_contract,
        signers_ids: signers.to_s.tr('[', '{').tr(']', '}')
      )
      send_to_docusign(document_sign)
    end

    document_signs = buy_contract.document_signs.where(
      signable: buy_contract.contract.candidate,
      documentable: company.company_candidate_docs.where(is_require: 'E-Signature').ids
    )

    success(document_signs: document_signs, results: results)
  end

  def sign_documents_for_vendor(buy_contract, doc_ids:, signers: nil)
    company_candidate_docs = company.company_candidate_docs.where(id: doc_ids)
    docusign_plugin = company.plugins.docusign.first
    return failure('Docusign plugin not configured') unless docusign_plugin

    unless (Time.current - docusign_plugin.updated_at).to_i.abs / 3600 <= 2
      response = RefreshToken.new(docusign_plugin).refresh_docusign_token
      return failure('Docusign token request failed, please regenerate the token from integrations') unless response.present?
    end

    results = company_candidate_docs.map do |sign_doc|
      document_sign = company.document_signs.create(
        requested_by: user,
        documentable: sign_doc,
        signable: buy_contract.company.owner,
        is_sign_done: false,
        part_of: buy_contract,
        signers_ids: signers.to_s.tr('[', '{').tr(']', '}')
      )
      send_to_docusign(document_sign, docusign_plugin)
    end

    document_signs = buy_contract.document_signs.where(
      signable: buy_contract.company.owner,
      documentable: company.company_candidate_docs.where(is_require: 'E-Signature').ids
    )

    success(document_signs: document_signs, results: results)
  end

  def request_employee_documents(buy_contract, doc_ids:, signers: nil)
    company_candidate_docs = company.company_candidate_docs.where(id: doc_ids)
    company_candidate_docs.each do |sign_doc|
      company.document_signs.create(
        requested_by: user,
        documentable: sign_doc,
        signable: buy_contract.contract.candidate,
        is_sign_done: false,
        part_of: buy_contract,
        signers_ids: signers.to_s.tr('[', '{').tr(']', '}')
      )
    end

    document_signs = buy_contract.document_signs.where(
      signable: buy_contract.contract.candidate,
      documentable: company.company_candidate_docs.where(is_require: 'Document').ids
    )

    success(document_signs: document_signs)
  end

  def sign_documents_for_sell_contract(sell_contract, doc_ids:, signers: nil)
    company_candidate_docs = company.company_candidate_docs.where(id: doc_ids)
    return failure('Docusign plugin not configured') unless plugin

    unless token_valid?
      response = RefreshToken.new(plugin).refresh_docusign_token
      return failure('Docusign token request failed, please regenerate the token from integrations') unless response.present?
    end

    results = company_candidate_docs.map do |sign_doc|
      document_sign = company.document_signs.create(
        requested_by: user,
        documentable: sign_doc,
        signable: sell_contract.team_admin,
        is_sign_done: false,
        part_of: sell_contract,
        signers_ids: signers.to_s.tr('[', '{').tr(']', '}')
      )
      send_to_docusign(document_sign)
    end

    document_signs = sell_contract.document_signs.where(
      documentable: company.company_candidate_docs.where(is_require: 'E-Signature').ids
    )

    success(document_signs: document_signs, results: results)
  end

  def request_sell_documents(sell_contract, doc_ids:)
    company_candidate_docs = company.company_candidate_docs.where(id: doc_ids)
    company_candidate_docs.each do |sign_doc|
      company.document_signs.create(
        requested_by: user,
        documentable: sign_doc,
        signable: sell_contract.team_admin,
        is_sign_done: false,
        part_of: sell_contract
      )
    end

    document_signs = sell_contract.document_signs.where(
      documentable: company.company_candidate_docs.where(is_require: 'Document').ids
    )

    success(document_signs: document_signs)
  end

  private

  def token_valid?
    plugin && (Time.current - plugin.updated_at).to_i.abs / 3600 <= 2
  end

  def send_to_docusign(document_sign, docusign_plugin = nil)
    active_plugin = docusign_plugin || plugin
    result = DocusignEnvelope.new(document_sign, active_plugin).create_envelope
    if !result.is_a?(Hash) && (result.status == 'sent')
      document_sign.update(envelope_id: result.envelope_id, envelope_uri: result.uri)
      { success: true, message: 'Document is submitted for signature' }
    else
      document_sign.destroy
      error = eval(result[:error_message])
      { success: false, message: "#{error[:errorCode]}: #{error[:message]}" }
    end
  end

  def success(data = {})
    { success: true }.merge(data)
  end

  def failure(message)
    { success: false, error: message }
  end
end
