class Candidate::DocumentSignsController < Candidate::BaseController
  before_action :set_document_sign, only: [:update, :show]
  add_breadcrumb 'Home', "/candidate", :title => ""

  def index
    add_breadcrumb "Document Requests", candidate_document_signs_path, :title => ""
    @document_signs = current_candidate.document_signs
  end

  def update
    if @document_sign.update(signed_file: params[:website_url], is_sign_done: true)
      flash[:success] = "Website url is submitted successfully"
    else
      flash[:errors] = @document_sign.errors.full_messages
    end
    redirect_back(fallback_location: candidate_document_signs_path)
  end

  def upload_document
    @document_sign = DocumentSign.find_by(id: params[:document_sign_id])
    @legal_doc = LegalDocument.find_by(id: params[:legal_doc_id])
    debugger
    if @document_sign.update(save_doc: @legal_doc, is_sign_done: true)
      flash[:success] = 'Submitted file from documents'
    else
      flash[:errors] = @document_sign.errors.full_messages
    end
    redirect_back fallback_location: root_path
  end

  def documents
    @document_sign = DocumentSign.find_by(id: params[:document_sign_id])
    @legal_docs = current_candidate.legal_documents
    respond_to do |format|
      format.js {}
    end
  end

  def show
    respond_to do |format|
      format.js {}
    end
  end

  private

  def set_document_sign
    @document_sign = current_candidate.document_signs.find_by(id: params[:id])
  end

end