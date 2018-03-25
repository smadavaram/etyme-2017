class Company::AttachmentsController < Company::BaseController

  before_action :set_attachments,only: [:index,:document_list]
  # add_breadcrumb current_company.name.titleize, "#", :title => ""

  def index
    @attachments_page = current_company.attachments.paginate(:page => params[:page], :per_page => 20)
    add_breadcrumb "Company Documents", attachments_path(current_company), :title => ""
    @company_doc = current_company.company_docs.new
    @company_doc.build_attachment
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
