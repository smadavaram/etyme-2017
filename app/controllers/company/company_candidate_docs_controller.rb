# frozen_string_literal: true

class Company::CompanyCandidateDocsController < Company::BaseController
  def index
    @company_candidate_docs = CompanyCandidateDoc.new
  end

  def create
    if params['company_candidate_docs']
      if (params['company_candidate_docs']['file'].present? && (params['company_candidate_docs']['is_require'] == 'signature')) || %w[Document Website].include?(params['company_candidate_docs']['is_require'])
        company_candidate_docs = CompanyCandidateDoc.new
        company_candidate_docs.title = params['company_candidate_docs']['title']
        company_candidate_docs.exp_date = params['company_candidate_docs']['exp_date']
        company_candidate_docs.file = params['company_candidate_docs']['file']
        company_candidate_docs.is_required_signature = params['company_candidate_docs']['is_required_signature'] == '1'
        company_candidate_docs.company_id = current_company.id
        company_candidate_docs.title_type = params['company_candidate_docs']['title_type']
        company_candidate_docs.is_require = params['company_candidate_docs']['is_require']
        company_candidate_docs.document_for = params['company_candidate_docs']['document_for']
        if company_candidate_docs.save
          flash[:success] = 'Document is added successfully'
          ActionCable.server.broadcast "Doc_User_#{current_user.id}",
                                       id: company_candidate_docs.id,
                                       title: company_candidate_docs.title,
                                       document_for: company_candidate_docs.document_for,
                                       title_type: company_candidate_docs.title_type,
                                       is_require: company_candidate_docs.is_require,
                                       expires_at: company_candidate_docs.exp_date,
                                       file: company_candidate_docs.file,
                                       file_name: company_candidate_docs.file&.split('/')&.last
        else
          flash[:errors] = company_candidate_docs.errors.full_messages
        end
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

    if params['company']
      params['company']['company_candidate_docs_attributes']&.each do |_key, data|
        next if data['file'].blank?

        company_candidate_docs = CompanyCandidateDoc.new
        company_candidate_docs.title = data['title']
        company_candidate_docs.exp_date = data['exp_date']
        company_candidate_docs.file = data['file']
        company_candidate_docs.is_required_signature = data['is_required_signature'] == '1' ? true : false
        company_candidate_docs.company_id = current_company.id
        company_candidate_docs.title_type = data['title_type']
        company_candidate_docs.is_require = data['is_require']
        company_candidate_docs.document_for = data['document_for']

        company_candidate_docs.save
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
    doc = begin
            CompanyCandidateDoc.find(params['id'])
          rescue StandardError
            nil
          end

    doc.delete unless doc.blank?
    redirect_to attachments_path
  end

  def delete_company_customer_docs
    doc = begin
            CompanyCustomerDoc.find(params['id'])
          rescue StandardError
            nil
          end

    doc.delete unless doc.blank?
    redirect_to attachments_path
  end

  def delete_company_vendor_docs
    doc = begin
            CompanyVendorDoc.find(params['id'])
          rescue StandardError
            nil
          end

    doc.delete unless doc.blank?
    redirect_to attachments_path
  end

  def delete_company_employee_docs
    doc = begin
            CompanyEmployeeDoc.find(params['id'])
          rescue StandardError
            nil
          end

    doc.delete unless doc.blank?
    redirect_to attachments_path
  end

  private

  def company_candidate_docs_params
    params.require(:company_candidate_docs).permit(:id, :name, :file, :title, :company_id, :is_required_signature, :title_type, :is_require, :document_for)
  end
end
