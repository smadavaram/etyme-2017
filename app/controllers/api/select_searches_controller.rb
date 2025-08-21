# frozen_string_literal: true

class Api::SelectSearchesController < ApplicationController
  respond_to :json

  def find_companies
    @companies = Company.like_any([:name], params[:q].to_s.split).paginate(page: params[:page], per_page: params[:per_page])
    respond_with @companies
  end

  def find_company_contacts_by_email
    @contacts = current_company.try(:company_contacts).like_any([:email], params[:q].to_s.split).paginate(page: params[:page], per_page: params[:per_page])
    respond_with @contacts
  end

  def find_client_companies
    @contacts_company_ids = current_company.try(:company_contacts).pluck(:user_company_id).uniq
    @companies = Company.where(id: @contacts_company_ids).like_any([:name], params[:q].to_s.split).paginate(page: params[:page], per_page: params[:per_page])
    respond_with @companies
  end

  def find_candidates
    @candidates = Candidate.like_any(%i[first_name last_name], params[:q].to_s.split).paginate(page: params[:page], per_page: params[:per_page])
    respond_with @candidates
  end

  def find_contacts
    @contacts = if params[:company].blank?
                  current_company.users.where.not(type: 'Consultant').like_any(%i[first_name last_name], params[:q].to_s.split).paginate(page: params[:page], per_page: params[:per_page])
                else
                  Company.find(params[:company].to_i).users.where.not(type: 'Consultant').like_any(%i[first_name last_name], params[:q].to_s.split).paginate(page: params[:page], per_page: params[:per_page])
                end
    respond_with @contacts
  end

  def find_users
    @users = current_company.users.where.not(type: 'Consultant').like_any(%i[first_name last_name], params[:q].to_s.split).paginate(page: params[:page], per_page: params[:per_page])
    respond_with @users
  end

  def find_signers
    @company = Company.find_by(id: params[:company_id])
    @users = @company.users.like_any(%i[first_name last_name], params[:q].to_s.split).paginate(page: params[:page], per_page: params[:per_page])
  end

  def find_jobs
    @jobs = current_company.jobs.where(listing_type: "Job").like_any([:title], params[:q].to_s.split).paginate(page: params[:page], per_page: params[:per_page])
    respond_with @jobs
  end

  def find_job_applicants
    job = Job.find(params[:job_id])
    ids = job.job_applications.where(applicationable_type: 'Candidate').pluck(:applicationable_id)
    @candidates = Candidate.where(id: ids).like_any(%i[first_name last_name], params[:q].to_s.split).paginate(page: params[:page], per_page: params[:per_page])
    respond_with @candidates
  end

  def find_user_sign
    @companies = Company.like_any([:name], params[:q].to_s.split).paginate(page: params[:page], per_page: params[:per_page])
    @candidates = Candidate.like_any(%i[first_name last_name], params[:q].to_s.split).paginate(page: params[:page], per_page: params[:per_page])
    respond_with [@companies, @candidates]
  end

  def find_commission_user
    @commission_users = current_company.admins.like_any(%i[first_name last_name], params[:q].to_s.split).paginate(page: params[:page], per_page: params[:per_page])
    respond_with @commission_users
  end

  def find_expense_type
    @expense_types = ExpenseType.like_any([:name], params[:q].to_s.split)
    respond_with @expense_types
  end

  def find_contract_candidate
    @contract = Contract.includes({ buy_contract: :company }, :candidate).find_by(id: params[:contract_id].to_i)
    respond_with @contract
  end

  def find_contract_salary_cycles
    @salary_cycles = ContractCycle.SalaryCalculation(params[:contract_id]).pluck('date(start_date), date(end_date), id')
    respond_with @salary_cycles
  end

  def find_company_admin
    @company_admins = current_company.admins.like_any([:first_name], params[:q].to_s.split).paginate(page: params[:page], per_page: params[:per_page])
    respond_with @company_admins
  end

  def find_hr_admins
    # @users = current_company.users.joins(:roles).where('roles.name': "HR admin").like_any([:first_name], params[:q].to_s.split).paginate(:page => params[:page], :per_page => params[:per_page])
    @users = if params[:company].blank? || params[:company].eql?('undefined')
               current_company.users.where.not(type: 'Consultant').all.like_any([:first_name], params[:q].to_s.split).paginate(page: params[:page], per_page: params[:per_page])
             else
               Company.find(params[:company]).users.where.not(type: 'Consultant').all.like_any([:first_name], params[:q].to_s.split).paginate(page: params[:page], per_page: params[:per_page])
             end

    respond_with @users
  end

  def find_reporting_manger
    @contacts = if params[:company].blank?
                  current_company.users.where.not(type: 'Consultant').like_any(%i[first_name last_name], params[:q].to_s.split).paginate(page: params[:page], per_page: params[:per_page])
                else
                  Company.find(params[:company].to_i).users.where.not(type: 'Consultant').like_any(%i[first_name last_name], params[:q].to_s.split).paginate(page: params[:page], per_page: params[:per_page])
                end
    respond_with @contacts
  end

  def find_commission_candidates
    @commission_candidates = current_company.candidates.like_any([:first_name], params[:q].to_s.split).paginate(page: params[:page], per_page: params[:per_page])
    respond_with @commission_candidates
  end
end
