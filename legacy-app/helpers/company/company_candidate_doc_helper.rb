# frozen_string_literal: true

module Company::CompanyCandidateDocHelper
  def signature_doc?; end

  def upload_doc?(document_sign)
    (document_sign.documentable.is_require == 'Document') && !document_sign.is_sign_done
  end

  def docusign_file(document_sign)
    document_sign.save_doc&.file
  end
end
