class Company::BlackListersController < Company::BaseController
  layout 'company'
  before_action :set_black_lister, only: [:ban,:unban]

  def ban
    if @black_lister.save
      flash[:success] = 'The company is blacklisted'
      redirect_to company_contacts_company_companies_path
    else
      flash[:errors] = @black_lister.errors.full_messages
      redirect_to company_contacts_company_companies_path
    end
  end

  def unban
    if @black_lister.unbanned!
      flash[:success] = "The company's blacklisted status is removed"
      redirect_to company_contacts_company_companies_path
    else
      flash[:errors] = @black_lister.errors.full_messages
      redirect_to company_contacts_company_companies_path
    end
  end

  private

  def set_black_lister
    @black_lister = current_company.banned_list.where(blacklister_type: params[:black_lister_type]).find_by(blacklister_id: params[:black_lister_id]) || current_company.banned_list.new(blacklister_id: params[:black_lister_id], blacklister_type: params[:black_lister_type])
  end

end