class Company::CompanyDocsController < Company::BaseController

  before_action :find_document ,only: :update
  respond_to :json,:html
  # // BREADCRUMBS
  add_breadcrumb "COMPANY DOCUMENTS", :attachments_path, options: { title: "COMPANY DOCUMENTS" }

  def index

  end

  def new
    add_breadcrumb "NEW", :new_company_doc_path
    @company_doc = current_company.company_docs.new
    @company_doc.build_attachment
  end

  def create
    @company_doc = current_company.company_docs.new(company_docs_params.merge!(created_by: current_user.id))
    if @company_doc.save
      flash[:success] = "Company doc added successfully."
      redirect_to attachments_path
    else
      flash[:errors] = @company_doc.errors.full_messages
      redirect_to :back
    end
  end
  def update
    @company_docs.update_attributes(company_docs_params)
    respond_with current_company.company_docs
  end

  private

    def find_document
      @company_docs=current_company.company_docs.find(params[:id])
    end

    def company_docs_params
      params.require(:company_doc).permit(:id,:name,:file, :created_by, :doc_type,:tag_list, :is_required_signature, attachment_attributes: [:id , :file,:file_size , :file_name, :file_type]
            )
    end


end
