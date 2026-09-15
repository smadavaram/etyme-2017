# frozen_string_literal: true

class Candidate::LegalDocsController < Candidate::BaseController
  def index
    @legal_docs = current_candidate.legal_documents
  end

  def create
    @legal_doc = current_candidate.legal_documents.build(legal_docs_params)
    if @legal_doc.save
      flash[:success] = 'Document Created Successfully'
    else
      flash[:errors] = @legal_doc.errors.full_messages
    end
    @legal_docs = current_candidate.legal_documents
    render :index
  end

  def delete
    doc = current_candidate.legal_documents.find_by(id: params[:id])
    if doc.destroy
      flash[:success] = 'Document destroyed successfully'
    else
      flash[:errors] = doc.errors.full_messages
    end
    @legal_docs = current_candidate.legal_documents
    render :index
  end

  private

  def legal_docs_params
    params.require(:legal_document).permit(:file, :title, :exp_date, :candidate_id)
  end
end
