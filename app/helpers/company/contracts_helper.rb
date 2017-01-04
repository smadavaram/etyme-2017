module Company::ContractsHelper
  def show_recipient_name contractable
    return "" if contractable.nil?
    if contractable.class.name == "Candidate"
      contractable.full_name
    else
      contractable.name.titleize
    end
  end

  def show_recipient_picture contractable
    return "" if contractable.nil?
    if contractable.class.name == "Candidate"
      contractable.photo
    else
      contractable.logo
    end
  end
end
