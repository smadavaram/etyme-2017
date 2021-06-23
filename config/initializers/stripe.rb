Rails.configuration.stripe = {
:publishable_key => 'pk_test_gqNrlDbWOF1mcoIKk5efAeJT005pdjrS5O',
:secret_key => 'sk_test_y1XuWLOawEZaZzwea1yNHEEW00g1QX3ojc'
}

Stripe.api_key = Rails.configuration.stripe[:secret_key]