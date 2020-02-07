# frozen_string_literal: true

class Company::BlackListersController < Company::BaseController
  layout 'company'
  before_action :set_black_lister, only: %i[ban unban]

  def ban
    if @black_lister.banned!
      flash[:success] = 'The company is blacklisted'
    else
      flash[:errors] = @black_lister.errors.full_messages
    end
    redirect_back(fallback_location: root_path)
  end

  def unban
    if @black_lister.unbanned!
      flash[:success] = "The company's blacklisted status is removed"
    else
      flash[:errors] = @black_lister.errors.full_messages
    end
    redirect_back(fallback_location: root_path)
  end

  private

  def set_black_lister
    @black_lister = current_company.banned_list.where(blacklister_type: params[:black_lister_type]).find_by(blacklister_id: params[:black_lister_id]) || current_company.banned_list.new(blacklister_id: params[:black_lister_id], blacklister_type: params[:black_lister_type])
  end
end
