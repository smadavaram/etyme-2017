json.id @contract.id
json.contract_type @contract.contract_type
json.company_id @contract.buy_contract&.company&.id
json.company_name @contract.buy_contract&.company&.full_name
json.candidate_id @contract.candidate.id
json.candidate_name @contract.candidate.full_name