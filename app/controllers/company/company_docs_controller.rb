class Company::CompanyDocsController < Company::BaseController

  # // BREADCRUMBS
  add_breadcrumb "COMPANY DOCUMENTS", :company_docs_path, options: { title: "COMPANY DOCUMENTS" }

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
      redirect_to company_docs_path
    else
      scjc
      flash[:errors] = @company_doc.errors.full_messages
      redirect_to company_docs_path
    end
  end

  private

    def company_docs_params
      params.require(:company_doc).permit(:id,:name,:file, :created_by, :doc_type,  :description , :is_required_signature, attachment_attributes: [:id , :file,:file_size , :file_name, :file_type]
            )
    end


end
