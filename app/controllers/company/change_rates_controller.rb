class Company::ChangeRatesController  < Company::BaseController
  before_action :load_contract, only: :create

  def create
    if @contract
      date_range = ChangeRate.get_date_range(Contract.first.id, params[:type]).map{|x| [x[0], x[1] ]  if (params[:change_rate][:from_date].to_date).between?(x[0], x[1])}.compact.first
      old_rate = ChangeRate.find_by(from_date: date_range[0], to_date: date_range[1], rate_type: params[:type]) if date_range
      if old_rate
        new_to_date = old_rate.to_date
        old_rate.update(to_date: change_rate_params[:from_date].to_date-1)
        new_rate = ChangeRate.create(change_rate_params.merge(contract_id: params[:contract_id], to_date: new_to_date, rate_type: params[:type]))
        flash[:notice] = 'Rate changed successfully.'
      else
        flash[:errors] = 'Rate Can be changed for the future dates of the contract'
      end
      redirect_to contract_path(params[:contract_id])
    end

  end

  def change_rate_params
    params.require(:change_rate).permit(:rate, :from_date)
  end

  private

  def load_contract
    @contract = Contract.find_by(id: params[:contract_id])
    unless @contract
      redirect_back fallback_location: root_path, error: "Contract not found."
    end
  end
end
