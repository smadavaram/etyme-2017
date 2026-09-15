# frozen_string_literal: true

module DateParser
  extend ActiveSupport::Concern
  class_methods do
    def foo(date)
      puts date
      if date.present? && date.to_s.include?("/")
        split_date = date.split("/")
        return split_date[1] + "/" + split_date[0] + "/" + split_date[2]
      else
        return date
      end
    end

    def set_date_formats(contract_params)
      c_params = contract_params
      if contract_params[:start_date].present? && contract_params[:end_date].present?
        c_params[:start_date]  = contract_params[:start_date].present? ? foo(contract_params[:start_date]) : @contract.start_date
        c_params[:end_date]  = contract_params[:end_date].present? ? foo(contract_params[:end_date]) : @contract.end_date
      elsif  contract_params[:sell_contract_attributes].present?
        puts contract_params[:sell_contract_attributes][:change_rates_attributes]["0"][:from_date]
        c_params[:sell_contract_attributes][:change_rates_attributes]["0"][:from_date] =  foo(contract_params[:sell_contract_attributes][:change_rates_attributes]["0"][:from_date])
        c_params[:sell_contract_attributes][:change_rates_attributes]["0"][:to_date] =  foo(contract_params[:sell_contract_attributes][:change_rates_attributes]["0"][:to_date])
        c_params[:sell_contract_attributes][:invoice_date_1] =  foo(contract_params[:sell_contract_attributes][:invoice_date_1])
        c_params[:sell_contract_attributes][:ts_date_1] =  foo(contract_params[:sell_contract_attributes][:ts_date_1])
        c_params[:sell_contract_attributes][:ta_date_1] =  foo(contract_params[:sell_contract_attributes][:ta_date_1])
        c_params[:sell_contract_attributes][:invoice_date_2] =  foo(contract_params[:sell_contract_attributes][:invoice_date_2])
        c_params[:sell_contract_attributes][:ts_date_2] =  foo(contract_params[:sell_contract_attributes][:ts_date_2])
        c_params[:sell_contract_attributes][:ta_date_2] =  foo(contract_params[:sell_contract_attributes][:ta_date_2])
        c_params[:sell_contract_attributes][:ce_date_1] =  foo(contract_params[:sell_contract_attributes][:ce_date_1])
        c_params[:sell_contract_attributes][:ce_date_2] =  foo(contract_params[:sell_contract_attributes][:ce_date_2])
        c_params[:sell_contract_attributes][:ce_ap_date_1] =  foo(contract_params[:sell_contract_attributes][:ce_ap_date_1])
        c_params[:sell_contract_attributes][:ce_ap_date_2] =  foo(contract_params[:sell_contract_attributes][:ce_ap_date_2])
        c_params[:sell_contract_attributes][:ce_in_date_1] =  foo(contract_params[:sell_contract_attributes][:ce_in_date_1])
        c_params[:sell_contract_attributes][:ce_in_date_2] =  foo(contract_params[:sell_contract_attributes][:ce_in_date_2])

      elsif  contract_params[:buy_contract_attributes].present?
        puts contract_params[:buy_contract_attributes][:change_rates_attributes]["0"][:from_date]
        c_params[:buy_contract_attributes][:change_rates_attributes]["0"][:from_date] =  foo(contract_params[:buy_contract_attributes][:change_rates_attributes]["0"][:from_date])
        c_params[:buy_contract_attributes][:change_rates_attributes]["0"][:to_date] =  foo(contract_params[:buy_contract_attributes][:change_rates_attributes]["0"][:to_date])
        c_params[:buy_contract_attributes][:ta_date_1] =  foo(contract_params[:buy_contract_attributes][:ta_date_1])
        c_params[:buy_contract_attributes][:ta_date_2] =  foo(contract_params[:buy_contract_attributes][:ta_date_2])
        c_params[:buy_contract_attributes][:ts_date_1] =  foo(contract_params[:buy_contract_attributes][:ts_date_1])
        c_params[:buy_contract_attributes][:ts_date_2] =  foo(contract_params[:buy_contract_attributes][:ts_date_2])
        c_params[:buy_contract_attributes][:sp_date_1] =  foo(contract_params[:buy_contract_attributes][:sp_date_1])
        c_params[:buy_contract_attributes][:sp_date_2] =  foo(contract_params[:buy_contract_attributes][:sp_date_2])
        c_params[:buy_contract_attributes][:sclr_date_1] =  foo(contract_params[:buy_contract_attributes][:sclr_date_1])
        c_params[:buy_contract_attributes][:sclr_date_2] =  foo(contract_params[:buy_contract_attributes][:sclr_date_2])
        c_params[:buy_contract_attributes][:sc_date_1] =  foo(contract_params[:buy_contract_attributes][:sc_date_1])
        c_params[:buy_contract_attributes][:sc_date_2] =  foo(contract_params[:buy_contract_attributes][:sc_date_2])
      else
        c_params = contract_params
      end
      c_params
    end
  end
end
