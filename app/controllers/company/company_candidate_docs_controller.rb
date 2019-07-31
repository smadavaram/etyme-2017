class Company::CompanyCandidateDocsController < Company::BaseController

	def index
		@company_candidate_docs = CompanyCandidateDoc.new()

  end

  def create

  	if params["company_candidate_docs"]
      if (params["company_candidate_docs"]["file"].present? and params["company_candidate_docs"]["is_require"] == "signature") ||  params["company_candidate_docs"]["is_require"] == "Document"
    		company_candidate_docs = CompanyCandidateDoc.new()
    		company_candidate_docs.title = params["company_candidate_docs"]["title"]
    		company_candidate_docs.exp_date = params["company_candidate_docs"]["exp_date"]
    		company_candidate_docs.file = params["company_candidate_docs"]["file"]
        company_candidate_docs.is_required_signature = params["company_candidate_docs"]["is_required_signature"] == "1" ? true : false
    		company_candidate_docs.company_id = current_company.id
        company_candidate_docs.title_type = params["company_candidate_docs"]["title_type"]
        company_candidate_docs.is_require = params["company_candidate_docs"]["is_require"]
        company_candidate_docs.document_for = params["company_candidate_docs"]["document_for"]
    		company_candidate_docs.save
      end  
  	end	

    # if params["company_customer_docs"]
    #   if !params["company_candidate_docs"]["file"].blank?
    #     company_customer_docs = CompanyCustomerDoc.new()
    #     company_customer_docs.title = params["company_customer_docs"]["title"]
    #     company_customer_docs.exp_date = params["company_customer_docs"]["exp_date"]
    #     company_customer_docs.file = params["company_customer_docs"]["file"]
    #     company_customer_docs.is_required_signature = params["company_customer_docs"]["is_required_signature"] == "1" ? true : false
    #     company_customer_docs.company_id = current_company.id

    #     company_customer_docs.save
    #   end  
    # end 

    # if params["company_vendor_docs"]
    #   if !params["company_candidate_docs"]["file"].blank?
    #     company_vendor_docs = CompanyVendorDoc.new()
    #     company_vendor_docs.title = params["company_vendor_docs"]["title"]
    #     company_vendor_docs.exp_date = params["company_vendor_docs"]["exp_date"]
    #     company_vendor_docs.file = params["company_vendor_docs"]["file"]
    #     company_vendor_docs.is_required_signature = params["company_vendor_docs"]["is_required_signature"] == "1" ? true : false
    #     company_vendor_docs.company_id = current_company.id
    #     company_vendor_docs.save
    #   end  
    # end 

    # if params["company_employee_docs"]
    #   if !params["company_candidate_docs"]["file"].blank?
    #     company_employee_docs = CompanyEmployeeDoc.new()
    #     company_employee_docs.title = params["company_employee_docs"]["title"]
    #     company_employee_docs.exp_date = params["company_employee_docs"]["exp_date"]
    #     company_employee_docs.file = params["company_employee_docs"]["file"]
    #     company_employee_docs.is_required_signature = params["company_employee_docs"]["is_required_signature"] == "1" ? true : false
    #     company_employee_docs.company_id = current_company.id
    #     company_employee_docs.save
    #   end  
    # end 


  	if params["company"]
  		if params["company"]["company_candidate_docs_attributes"]
  			params["company"]["company_candidate_docs_attributes"].each do |key,data|
          if !data["file"].blank?
    				company_candidate_docs = CompanyCandidateDoc.new()
    				company_candidate_docs.title = data["title"]
  		  		company_candidate_docs.exp_date = data["exp_date"]
  		  		company_candidate_docs.file = data["file"]
            company_candidate_docs.is_required_signature = data["is_required_signature"] == "1" ? true : false
  		  		company_candidate_docs.company_id = current_company.id
            company_candidate_docs.title_type = data["title_type"]
            company_candidate_docs.is_require = data["is_require"]
            company_candidate_docs.document_for = data["document_for"]

  		  		company_candidate_docs.save
          end   
  			end	
  		end	

      # if params["company"]["company_customer_docs_attributes"]
      #   params["company"]["company_customer_docs_attributes"].each do |key,data|
      #     if !data["file"].blank?
      #       company_customer_docs = CompanyCustomerDoc.new()
      #       company_customer_docs.title = data["title"]
      #       company_customer_docs.exp_date = data["exp_date"]
      #       company_customer_docs.file = data["file"]
      #       company_customer_docs.is_required_signature = data["is_required_signature"] == "1" ? true : false
      #       company_customer_docs.company_id = current_company.id
      #       company_customer_docs.save
      #     end   
      #   end 
      # end 

      # if params["company"]["company_vendor_docs_attributes"]
      #   params["company"]["company_vendor_docs_attributes"].each do |key,data|
      #     if !data["file"].blank?
      #       company_vendor_docs = CompanyVendorDoc.new()
      #       company_vendor_docs.title = data["title"]
      #       company_vendor_docs.exp_date = data["exp_date"]
      #       company_vendor_docs.file = data["file"]
      #       company_vendor_docs.is_required_signature = data["is_required_signature"] == "1" ? true : false
      #       company_vendor_docs.company_id = current_company.id
      #       company_vendor_docs.save
      #     end   
      #   end 
      # end 

      # if params["company"]["company_employee_docs_attributes"]
      #   params["company"]["company_employee_docs_attributes"].each do |key,data|
      #     if !data["file"].blank?
      #       company_employee_docs = CompanyEmployeeDoc.new()
      #       company_employee_docs.title = data["title"]
      #       company_employee_docs.exp_date = data["exp_date"]
      #       company_employee_docs.file = data["file"]
      #       company_employee_docs.is_required_signature = data["is_required_signature"] == "1" ? true : false
      #       company_employee_docs.company_id = current_company.id
      #       company_employee_docs.save
      #     end   
      #   end 
      # end 


  	end	

  	redirect_to attachments_path

  end


  def delete_company_candidate_docs
    doc = CompanyCandidateDoc.find(params["id"]) rescue nil

    if !doc.blank?
      doc.delete
    end  
    redirect_to attachments_path  
  end


  def delete_company_customer_docs
    doc = CompanyCustomerDoc.find(params["id"]) rescue nil

    if !doc.blank?
      doc.delete
    end  
    redirect_to attachments_path  
  end


  def delete_company_vendor_docs
    doc = CompanyVendorDoc.find(params["id"]) rescue nil

    if !doc.blank?
      doc.delete
    end  
    redirect_to attachments_path  
  end


  def delete_company_employee_docs
    doc = CompanyEmployeeDoc.find(params["id"]) rescue nil

    if !doc.blank?
      doc.delete
    end  
    redirect_to attachments_path  
  end
    
  	

   private


    def company_candidate_docs_params
      params.require(:company_candidate_docs).permit(:id,:name,:file, :title ,:company_id, :is_required_signature, :title_type, :is_require, :document_for)
    end


end
