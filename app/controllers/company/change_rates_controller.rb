class Company::ChangeRatesController  < Company::BaseController

  def create
    change_rates = ChangeRate.where(contract_id: params[:contract_id].to_i)
    if change_rates.present?
      change_rates.last.update(to_date: change_rate_params[:from_date].to_date-1)
      new_rate = ChangeRate.create(change_rate_params.merge(contract_id: params[:contract_id].to_i, to_date: Date.new(9999, 12, 31), rate_type: params[:type]))
    end
    flash[:notice] = 'Rate changed successfully.'
    redirect_to contract_path(params[:contract_id])

  end

  def change_rate_params
    params.require(:change_rate).permit(:rate, :from_date)
  end

end
