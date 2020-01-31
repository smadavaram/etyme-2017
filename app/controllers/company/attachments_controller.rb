# frozen_string_literal: true

class Company::AttachmentsController < Company::BaseController
  before_action :set_attachments, only: %i[index document_list]
  # add_breadcrumb current_company.name.titleize, "#", :title => ""
  add_breadcrumb 'Dashboard', :dashboard_path

  def index
    add_breadcrumb 'Company Documents', attachments_path(current_company), title: ''

    @attachments_page = current_company.attachments.paginate(page: params[:page], per_page: 20)
    @company_doc = current_company.company_docs.new
    @company_doc.build_attachment
    @company_candidate_docs = CompanyCandidateDoc.new
  end

  # def document_list
  #   render layout: false
  # end

  private

  def set_attachments
    @attachment_types = current_company.attachments.map(&:attachable_type).uniq || []
    @attachments      = current_company.attachments || []
    @selected_attachments = current_company.attachments.where(attachable_type: params[:type])
  end
end
