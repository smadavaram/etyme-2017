module Company::ContractsHelper
  def show_recipient_name contractable
    if contractable.class.name == "Candidate"
      contractable.full_name
    else
      contractable.name.titleize
    end
  end

  def show_recipient_picture contractable
    if contractable.class.name == "Candidate"
      contractable.photo
    else
      contractable.logo
    end
  end
end
