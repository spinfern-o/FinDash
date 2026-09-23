public class Expenses {

    int eMonthNum;
    double COGS;
    double packaging;
    double rent;
    double utilities;
    double maintenance;
    double hardware;
    double insurance;
    double marketing;
    double creditCardFees;
    double businessLicense;
    double telephone;
    double employeeMeals;
    double tax;
    double labor;

    public Expenses(
        int eMonthNum,
        double COGS,
        double packaging,
        double rent,
        double utilities,
        double maintenance,
        double hardware,
        double insurance,
        double marketing,
        double creditCardFees,
        double businessLicense,
        double telephone,
        double employeeMeals,
        double tax,
        double labor
    ) {
        this.eMonthNum = eMonthNum;
        this.COGS = COGS;
        this.packaging = packaging;
        this.rent = rent;
        this.utilities = utilities;
        this.maintenance = maintenance;
        this.hardware = hardware;
        this.insurance = insurance;
        this.marketing = marketing;
        this.creditCardFees = creditCardFees;
        this.businessLicense = businessLicense;
        this.telephone = telephone;
        this.employeeMeals = employeeMeals;
        this.tax = tax;
        this.labor = labor;
    }

    public int eMonthNum() {
        return eMonthNum;
    }

    public double COGS() {
        return COGS;
    }

    public double packaging() {
        return packaging;
    }

    public double rent() {
        return rent;
    }

    public double utilities() {
        return utilities;
    }

    public double maintenance() {
        return maintenance;
    }

    public double hardware() {
        return hardware;
    }

    public double insurance() {
        return insurance;
    }

    public double marketing() {
        return marketing;
    }

    public double creditCardFees() {
        return creditCardFees;
    }

    public double businessLicense() {
        return businessLicense;
    }

    public double telephone() {
        return telephone;
    }

    public double employeeMeals() {
        return employeeMeals;
    }

    public double tax() {
        return tax;
    }

    public double labor() {
        return labor;
    }
}