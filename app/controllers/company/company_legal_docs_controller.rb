class Company::CompanyLegalDocsController < Company::BaseController


	def index
		@company_legal_docs = CompanyLegalDoc.new()

  end

  def create

  	if params["company_legal_docs"]
  		company_legal_docs = CompanyLegalDoc.new()
  		company_legal_docs.title = params["company_legal_docs"]["title"]
  		company_legal_docs.custome_name = params["company_legal_docs"]["custome_name"]
  		company_legal_docs.exp_date = params["company_legal_docs"]["exp_date"]
  		company_legal_docs.file = params["company_legal_docs"]["file"]

  		company_legal_docs.company_id = current_company.id
  		company_legal_docs.save
  	end	

  	if params["company"]
  		if params["company"]["company_legal_docs_attributes"]
  			params["company"]["company_legal_docs_attributes"].each do |key,data|
  				company_legal_docs = CompanyLegalDoc.new()
  				company_legal_docs.title = data["title"]
		  		company_legal_docs.custome_name = data["custome_name"]
		  		company_legal_docs.exp_date = data["exp_date"]
		  		company_legal_docs.file = data["file"]

		  		company_legal_docs.company_id = current_company.id
		  		company_legal_docs.save
  			end	
  		end	
  	end	

  	redirect_to company_legal_docs_path

  end
  	

   private


    def company_legal_docs_params
      params.require(:company_legal_docs).permit(:id,:name,:file, :title, :custome_name,:company_id)
    end



end
