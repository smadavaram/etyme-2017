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