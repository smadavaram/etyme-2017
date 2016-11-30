class Company::AttachmentsController < Company::BaseController

  before_action :set_attachments,only: [:index,:document_list]
  # add_breadcrumb current_company.name.titleize, "#", :title => ""

  def index
    @attachments_page=Attachment.paginate(:page => params[:page], :per_page => 20)
    add_breadcrumb "Company Documents", attachments_path(current_company), :title => ""
  end

  def document_list
    render layout: false
  end

  private
  def set_attachments
    all_attachemts=Attachment.all
    @attachments=all_attachemts.group_by(&:attachable_type)
  end
end
