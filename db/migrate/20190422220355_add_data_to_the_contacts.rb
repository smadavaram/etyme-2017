class AddDataToTheContacts < ActiveRecord::Migration[5.1]
  def up
    CompanyContact.all.each do |company_contact|
        # puts company_contact.id
        user = User.find_by_email(company_contact.email)
        company = Company.find_by(slug: company_contact.email.match(/@([a-zA-Z]+)./)[1])
        if company.blank?
          company = Company.create(name: "Company", slug: company_contact.email.match(/@([a-zA-Z]+)./)[1], domain: "#{ company_contact.email.match(/@([a-zA-Z]+)./)[1]}.com")
        end
        if user.blank?
          User.create(first_name: company_contact.first_name,
                      last_name: company_contact.last_name,
                      email: company_contact.email,
                      password: "etyme123", password_confirmation: "etyme123")
        elsif begin

          company_contact = company_contact.update(user_id: user.id,
                                                   user_company_id: company.id)
        rescue
          puts company_contact.inspect
        end


        end
    end
  end

end
