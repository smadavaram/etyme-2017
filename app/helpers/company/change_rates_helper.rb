module Company::ChangeRatesHelper
	def get_rate(date, contract_id, type)
		ChangeRate.rate(date, contract_id, type)
	end
end
